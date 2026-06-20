// ANTA Chat - Uçtan Uca Şifreleme Kurulum / Giriş Ekranı
// Dosya Yolu: anta-chat/components/E2ESetupScreen.js
//
// İlk kuran kişi ortak parolayı belirler (salt + doğrulama değeri sunucuya yazılır).
// İkinci kişi aynı parolayı girer; doğrulanırsa anahtar cihaza kaydedilir.

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../supabase';
import {
  deriveKey,
  setKey,
  clearKey,
  keyToBase64,
  generateSaltB64,
  makeCheck,
  verifyCheck,
} from '../crypto';

export default function E2ESetupScreen({ onReady }) {
  const [mode, setMode] = useState(null); // 'create' | 'join'
  const [saltB64, setSaltB64] = useState(null);
  const [checkCipher, setCheckCipher] = useState(null);

  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Sunucuda ortak parola daha önce kurulmuş mu kontrol et
  useEffect(() => {
    const check = async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('key,value')
          .in('key', ['e2e_salt', 'e2e_check']);
        const salt = data?.find((r) => r.key === 'e2e_salt')?.value || null;
        const chk = data?.find((r) => r.key === 'e2e_check')?.value || null;
        setSaltB64(salt);
        setCheckCipher(chk);
        setMode(salt ? 'join' : 'create');
      } catch (err) {
        console.error('E2E durum kontrolü hatası:', err);
        setMode('create');
      }
    };
    check();
  }, []);

  const finish = async (key) => {
    await SecureStore.setItemAsync('e2e_key', keyToBase64(key));
    onReady();
  };

  const handleSubmit = () => {
    setError('');
    if (pass.length < 6) {
      setError('Parola en az 6 karakter olmalı.');
      return;
    }
    if (mode === 'create' && pass !== confirm) {
      setError('Parolalar eşleşmiyor.');
      return;
    }

    setBusy(true);
    // Anahtar türetme CPU-yoğun; spinner görünsün diye bir tık geciktir
    setTimeout(async () => {
      try {
        if (mode === 'create') {
          const salt = generateSaltB64();
          const key = deriveKey(pass, salt);
          setKey(key);
          const chk = makeCheck();
          const { error: dbErr } = await supabase
            .from('app_settings')
            .upsert(
              [
                { key: 'e2e_salt', value: salt },
                { key: 'e2e_check', value: chk },
              ],
              { onConflict: 'key' }
            );
          if (dbErr) throw dbErr;
          await finish(key);
        } else {
          const key = deriveKey(pass, saltB64);
          setKey(key);
          if (checkCipher && verifyCheck(checkCipher)) {
            await finish(key);
          } else if (!checkCipher) {
            // Salt var ama kontrol değeri yoksa oluştur
            const chk = makeCheck();
            await supabase
              .from('app_settings')
              .upsert([{ key: 'e2e_check', value: chk }], { onConflict: 'key' });
            await finish(key);
          } else {
            clearKey();
            setError('Parola hatalı. Ortağınla aynı parolayı girmelisin.');
          }
        }
      } catch (err) {
        console.error('E2E kurulum hatası:', err);
        clearKey();
        setError('Bir hata oluştu, tekrar dene.');
      } finally {
        setBusy(false);
      }
    }, 60);
  };

  if (mode === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#00FF87" />
      </View>
    );
  }

  const isCreate = mode === 'create';

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.iconBox}>
            <Ionicons name="lock-closed" size={56} color="#00FF87" />
          </View>

          <Text style={styles.title}>
            {isCreate ? 'Şifreleme Parolası Belirle' : 'Şifreleme Parolasını Gir'}
          </Text>
          <Text style={styles.subtitle}>
            {isCreate
              ? 'Mesajlar ve kasa bu ortak parolayla uçtan uca şifrelenir. Ortağınla AYNI parolayı kullanmalısın. Parola hiçbir zaman sunucuya gönderilmez.'
              : 'Ortağının belirlediği ortak şifreleme parolasını gir. Aynı parola olmadan veriler çözülemez.'}
          </Text>

          {isCreate && (
            <View style={styles.warnBox}>
              <Ionicons name="warning-outline" size={16} color="#F59E0B" />
              <Text style={styles.warnText}>
                Bu parolayı GÜVENLİ bir yere not et. Unutulursa şifreli verilerin kalıcı olarak kaybolur — geri kurtarma yoktur.
              </Text>
            </View>
          )}

          <View style={styles.inputWrap}>
            <Ionicons name="key-outline" size={20} color="#4B5563" />
            <TextInput
              style={styles.input}
              placeholder="Ortak parola"
              placeholderTextColor="#4B5563"
              value={pass}
              onChangeText={setPass}
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShow(!show)}>
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {isCreate && (
            <View style={styles.inputWrap}>
              <Ionicons name="key-outline" size={20} color="#4B5563" />
              <TextInput
                style={styles.input}
                placeholder="Parolayı tekrar gir"
                placeholderTextColor="#4B5563"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!show}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#0B0F19" />
            ) : (
              <>
                <Text style={styles.buttonText}>
                  {isCreate ? 'Parolayı Oluştur ve Başla' : 'Parolayı Doğrula'}
                </Text>
                <Ionicons name="shield-checkmark" size={18} color="#0B0F19" />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  flex: { flex: 1 },
  loading: { flex: 1, backgroundColor: '#0B0F19', alignItems: 'center', justifyContent: 'center' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 14 },
  iconBox: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(0,255,135,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,255,135,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { color: '#F3F4F6', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#9CA3AF', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  warnBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 10,
    padding: 12,
  },
  warnText: { flex: 1, color: '#FBBF24', fontSize: 12, lineHeight: 17 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 54,
    borderRadius: 12,
    backgroundColor: '#111827',
    borderWidth: 1.5,
    borderColor: '#1F2937',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  input: { flex: 1, color: '#F3F4F6', fontSize: 15 },
  error: { color: '#EF4444', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  button: {
    height: 54,
    borderRadius: 12,
    backgroundColor: '#00FF87',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#0B0F19', fontSize: 15, fontWeight: '700' },
});
