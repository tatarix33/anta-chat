# ANTA Chat - Backend Kurulum & Entegrasyon Kılavuzu

Bu kılavuz, **ANTA Chat** uygulamasının mobil ön yüzünü Supabase veritabanına ve Cloudflare R2 depolama alanına nasıl bağlayacağınızı adım adım açıklamaktadır.

---

## 🛠️ 1. Adım: Supabase Veritabanının Kurulması

1. [Supabase](https://supabase.com) panelinize girin ve yeni bir proje oluşturun.
2. Sol menüdeki **SQL Editor** sekmesine gidin.
3. Proje klasöründeki [schema.sql](file:///Users/tarik/Desktop/adsız klasör 2/anta-chat/schema.sql) dosyasının içeriğini kopyalayıp editöre yapıştırın ve **Run** butonuna basın.
4. Bu işlem veritabanı tablolarını (`messages`, `app_settings`), varsayılan PIN şifresini ve Realtime dinleyicilerini oluşturur.

---

## ☁️ 2. Adım: Cloudflare R2 Depolamasının Kurulması

1. Cloudflare panelinizden **R2** sekmesine gidin.
2. **"Create Bucket"** butonuna basarak `chat-media` adında yeni bir bucket oluşturun.
3. Kovanın genel erişime açılması için kova ayarlarından **Public Access** alanını aktif edin (veya kendi özel alan adınızı bağlayın).
4. Sağ üstteki **"Manage R2 API Tokens"** linkine tıklayarak **Read/Write** yetkilerine sahip yeni bir API token oluşturun.
5. Oluşan şu bilgileri güvenli bir yere not edin:
   * **Access Key ID**
   * **Secret Access Key**
   * **Endpoint** (Örn: `https://<account-id>.r2.cloudflarestorage.com`)

---

## ⚡ 3. Adım: Supabase Edge Function (Serverless API) Kurulumu

Görsellerin güvenli şekilde R2'ye yüklenmesi için hazırladığımız `r2-uploader` Edge Function kodunu canlıya almamız gerekir.

1. Bilgisayarınızda terminal açıp Supabase CLI'yı yükleyin (eğer yüklü değilse):
   ```bash
   npm install -g supabase
   ```
2. Supabase hesabınızla giriş yapın:
   ```bash
   supabase login
   ```
3. Proje dizininde Supabase projenizi eşleştirin (Size sorulan proje referans kodunu girin):
   ```bash
   supabase link --project-ref KENDI_PROJECT_REF_KODUNUZ
   ```
4. Cloudflare R2 şifrelerini Supabase sistemine güvenli çevre değişkeni (Secret) olarak kaydedin:
   ```bash
   supabase secrets set R2_ACCESS_KEY_ID="KENDI_ACCESS_KEY_ID"
   supabase secrets set R2_SECRET_ACCESS_KEY="KENDI_SECRET_ACCESS_KEY"
   supabase secrets set R2_ENDPOINT="https://KENDI_ACCOUNT_ID.r2.cloudflarestorage.com"
   supabase secrets set R2_BUCKET_NAME="chat-media"
   supabase secrets set R2_PUBLIC_DOMAIN="https://pub-KENDI_DOMAIN.r2.dev"
   ```
   *(Not: `R2_PUBLIC_DOMAIN` kısmına Cloudflare R2 kovanızın genel erişim adresini veya özel alan adınızı `https://` ile başlayarak yazın).*
5. Edge Function'ı deploy edin (canlıya alın):
   ```bash
   supabase functions deploy r2-uploader --no-verify-jwt
   ```

---

## 📱 4. Adım: Mobil Uygulamanın Bağlanması

1. Projedeki [supabase.js](file:///Users/tarik/Desktop/adsız klasör 2/anta-chat/supabase.js) dosyasını açın.
2. Supabase panelinizin **Settings > API** kısmından aldığınız:
   * **Project URL** değerini `SUPABASE_URL` alanına yapıştırın.
   * **Anon Public Key** değerini `SUPABASE_ANON_KEY` alanına yapıştırın.
3. Dosyayı kaydedin.

---

## 🚀 5. Adım: Çalıştırma ve Test

Her şey kurulduktan sonra uygulamayı başlatmak için:
```bash
cd anta-chat
npm run start
```
Telefonunuzdan **Expo Go** uygulaması ile QR kodu okutun.
* İlk girişte kilit ekranında **`1234`** yazarak kilidi açın.
* Bir kullanıcı adı belirleyin.
* Fotoğraf veya video gönderdiğinizde, dosyanın önce Cloudflare R2'ye yüklendiğini, ardından veritabanına kaydedilerek sohbete canlı düştüğünü göreceksiniz.
