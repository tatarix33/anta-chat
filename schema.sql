-- ANTA Chat - Supabase PostgreSQL Database Schema
-- Bu dosyayı Supabase panelindeki SQL Editor kısmına yapıştırıp çalıştırabilirsiniz.

-- 1. Tabloların Temizlenmesi (Varsa)
drop table if exists public.messages cascade;
drop table if exists public.profiles cascade;
drop table if exists public.app_settings cascade;

-- 2. Kullanıcı Profilleri Tablosu
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  push_token text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Sohbet Mesajları Tablosu
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  sender_name text not null,                          -- Gönderen kullanıcının adı
  text text,                                         -- Mesaj metni
  media_url text,                                    -- Orijinal Fotoğraf/Video linki (Cloudflare R2)
  thumbnail_url text,                                -- Küçük fotoğraf linki (Cloudflare R2)
  media_type text default 'text',                     -- 'text', 'image', 'video'
  reply_to_id uuid,                                   -- Alıntılanan mesajın id'si (yanıt)
  reply_to_sender text,                              -- Alıntılanan mesajın göndereni (denormalize)
  reply_to_text text,                                -- Alıntılanan mesajın önizleme metni (denormalize)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Mevcut (eski) bir veritabanında tabloyu silmeden yanıt kolonlarını eklemek için:
-- (Yeni kurulumda yukarıdaki create table zaten içeriyor, bu blok zararsızdır.)
alter table public.messages add column if not exists reply_to_id uuid;
alter table public.messages add column if not exists reply_to_sender text;
alter table public.messages add column if not exists reply_to_text text;

-- 4. Ortak Uygulama Ayarları Tablosu (PIN şifresi)
create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Varsayılan PIN şifresini yerleştir (1234)
insert into public.app_settings (key, value) 
values ('lock_pin', '1234')
on conflict (key) do nothing;

-- 5. Veritabanı Değişikliklerinin Realtime (Anlık) İzlenmesini Sağlama
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.app_settings;

-- 6. RLS (Row Level Security) Ayarları - Güvenli Yetkilendirme Politikaları
alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.app_settings enable row level security;

-- Profiles Politikaları
create policy "Herkes profilleri okuyabilir" on public.profiles for select using (true);
create policy "Kullanıcı kendi profilini oluşturabilir" on public.profiles for insert with check (auth.uid() = id);
create policy "Kullanıcı kendi profilini güncelleyebilir" on public.profiles for update using (auth.uid() = id);

-- Messages Politikaları (Sadece giriş yapmış kullanıcılar okuyabilir/yazabilir)
create policy "Giriş yapmış kullanıcılar mesaj okuyabilir" on public.messages 
  for select using (auth.role() = 'authenticated');

create policy "Giriş yapmış kullanıcılar mesaj ekleyebilir" on public.messages
  for insert with check (auth.role() = 'authenticated');

-- Mesaj silme: uzun basınca tek mesaj ve "tüm sohbeti sil" için gerekli.
-- (2 kişilik kapalı kullanım: giriş yapmış herkes silebilir.)
create policy "Giriş yapmış kullanıcılar mesaj silebilir" on public.messages
  for delete using (auth.role() = 'authenticated');

-- App Settings Politikaları (Sadece giriş yapmış kullanıcılar okuyabilir/güncelleyebilir)
create policy "Giriş yapmış kullanıcılar ayarları okuyabilir" on public.app_settings 
  for select using (auth.role() = 'authenticated');

create policy "Giriş yapmış kullanıcılar ayarları güncelleyebilir" on public.app_settings
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- E2E şifreleme tuzu/kontrolü gibi yeni ayar satırlarının eklenebilmesi için insert izni
create policy "Giriş yapmış kullanıcılar ayar ekleyebilir" on public.app_settings
  for insert with check (auth.role() = 'authenticated');

-- 7. Push Bildirimleri İçin pg_net Uzantısı ve Tetikleyici (Trigger)
-- Bu kısım, yeni bir mesaj eklendiğinde Expo Push API üzerinden diğer kullanıcılara bildirim gönderir.

-- pg_net uzantısını aktif et (HTTP istekleri için)
create extension if not exists pg_net with schema extensions;

-- Bildirim Gönderme Fonksiyonu
create or replace function public.send_push_notification()
returns trigger
security definer
language plpgsql
as $$
declare
  payload jsonb;
  body_text text;
begin
  -- Bildirim gövdesini medya tipine göre belirle.
  -- NOT: Mesaj metni uçtan uca şifreli olduğu için içerik bildirime konmaz;
  -- sunucu metni okuyamaz. Bu yüzden genel bir gövde gösterilir.
  body_text := case
                 when new.media_type = 'image' then '📷 Fotoğraf gönderdi'
                 when new.media_type = 'video' then '🎥 Video gönderdi'
                 else '🔒 Yeni mesaj'
               end;

  -- Gönderen hariç tüm kullanıcıların token'larını TEK bir JSON dizisinde topla.
  -- (Expo Push API tek istekte 100 bildirime kadar kabul eder.)
  select jsonb_agg(
    jsonb_build_object(
      'to', push_token,
      'sound', 'default',
      'title', new.sender_name,
      'body', body_text,
      'data', jsonb_build_object(
        'messageId', new.id,
        'sender', new.sender_name
      )
    )
  )
  into payload
  from public.profiles
  where push_token is not null
    and username != new.sender_name;

  -- Gönderilecek kimse yoksa erken çık
  if payload is null then
    return new;
  end if;

  -- pg_net üzerinden Expo Push API'sine tek bir asenkron POST isteği gönder
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := payload
  );

  return new;
end;
$$;

-- Tetikleyiciyi Oluştur (Her yeni mesaj eklendiğinde çalışır)
drop trigger if exists on_new_message_send_push on public.messages;
create trigger on_new_message_send_push
  after insert on public.messages
  for each row
  execute function public.send_push_notification();

-- =====================================================================
-- 8. KASA (VAULT) ve GÖREVLER (TO-DO) MODÜLLERİ
-- Mevcut bir veritabanında bu bloğu olduğu gibi çalıştırmak güvenlidir;
-- "if not exists" sayesinde var olan veriye dokunmaz.
-- (2 kişilik kapalı kullanım: tüm giriş yapmış kullanıcılar erişebilir.)
-- =====================================================================

-- 8.1 Kasa: Notlar
create table if not exists public.vault_notes (
  id uuid default gen_random_uuid() primary key,
  title text,
  content text,
  author text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8.2 Kasa: Dosyalar (Cloudflare R2'de saklanır, burada sadece üst veri tutulur)
create table if not exists public.vault_files (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  url text not null,
  size bigint,
  mime_type text,
  author text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8.3 Kasa: Şifre / Hesap Kayıtları
create table if not exists public.vault_secrets (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  account text,                                       -- kullanıcı adı / e-posta
  secret text,                                        -- şifre / gizli değer
  note text,
  author text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8.4 Cases (Kanban) — Sütunlar / Listeler
create table if not exists public.cases_columns (
  id text primary key,                                -- 'col-1' gibi sabit ya da üretilmiş id
  title text not null,
  position int default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8.5 Cases (Kanban) — Etiketler
create table if not exists public.cases_labels (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  color text not null,                                -- hex renk (#EF4444 gibi)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8.6 Cases (Kanban) — Kartlar
create table if not exists public.cases (
  id uuid default gen_random_uuid() primary key,
  column_id text not null,
  title text not null,
  description text,
  labels jsonb default '[]'::jsonb not null,          -- etiket id dizisi
  assignee text,                                      -- 'Anıl' / 'Tarık' / 'Ortak'
  image_url text,                                     -- kapak resmi
  subtasks jsonb default '[]'::jsonb not null,        -- [{id,text,completed}]
  comments jsonb default '[]'::jsonb not null,        -- [{id,text,author,createdAt}]
  position int default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Realtime (anlık senkron) için yayına ekle
alter publication supabase_realtime add table public.vault_notes;
alter publication supabase_realtime add table public.vault_files;
alter publication supabase_realtime add table public.vault_secrets;
alter publication supabase_realtime add table public.cases_columns;
alter publication supabase_realtime add table public.cases_labels;
alter publication supabase_realtime add table public.cases;

-- RLS aç
alter table public.vault_notes enable row level security;
alter table public.vault_files enable row level security;
alter table public.vault_secrets enable row level security;
alter table public.cases_columns enable row level security;
alter table public.cases_labels enable row level security;
alter table public.cases enable row level security;

-- Politikalar: giriş yapmış kullanıcılar tüm işlemleri yapabilir
do $$
declare
  t text;
begin
  foreach t in array array['vault_notes','vault_files','vault_secrets','cases_columns','cases_labels','cases']
  loop
    execute format($f$
      drop policy if exists "auth_all_select" on public.%1$I;
      drop policy if exists "auth_all_insert" on public.%1$I;
      drop policy if exists "auth_all_update" on public.%1$I;
      drop policy if exists "auth_all_delete" on public.%1$I;
      create policy "auth_all_select" on public.%1$I for select using (auth.role() = 'authenticated');
      create policy "auth_all_insert" on public.%1$I for insert with check (auth.role() = 'authenticated');
      create policy "auth_all_update" on public.%1$I for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
      create policy "auth_all_delete" on public.%1$I for delete using (auth.role() = 'authenticated');
    $f$, t);
  end loop;
end$$;

