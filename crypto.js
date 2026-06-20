// ANTA Chat - Uçtan Uca Şifreleme (E2E) Çekirdek Modülü
// Dosya Yolu: anta-chat/crypto.js
//
// Mantık: İki kişinin bildiği ORTAK PAROLA'dan cihazda bir anahtar türetilir.
// Parola/anahtar asla sunucuya gönderilmez. Veriler cihazda şifrelenip
// Supabase'e şifreli (ciphertext) yazılır, okurken cihazda çözülür.
// Şifreleme: tweetnacl secretbox (XSalsa20-Poly1305, kimlik doğrulamalı).

import nacl from 'tweetnacl';
import {
  encodeBase64,
  decodeBase64,
  decodeUTF8,
  encodeUTF8,
} from 'tweetnacl-util';
import * as Crypto from 'expo-crypto';

// tweetnacl'in nonce üretimi için güvenli rastgelelik kaynağı (expo-crypto)
nacl.setPRNG((x, n) => {
  const bytes = Crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) x[i] = bytes[i];
});

const PREFIX = 'enc::';
const MAGIC = 'ANTA_E2E_OK';
const KDF_ITERATIONS = 10000;

// Bellekte tutulan aktif anahtar (Uint8Array(32))
let cachedKey = null;

// Paroladan + tuzdan (salt) 32 baytlık anahtar türet (SHA-512 tekrarlı germe)
export function deriveKey(passphrase, saltB64) {
  let k = decodeUTF8(`${passphrase}|${saltB64}`);
  for (let i = 0; i < KDF_ITERATIONS; i++) {
    k = nacl.hash(k); // SHA-512 → 64 bayt
  }
  return k.slice(0, 32);
}

export function setKey(key) {
  cachedKey = key;
}
export function clearKey() {
  cachedKey = null;
}
export function hasKey() {
  return !!cachedKey;
}

export function keyToBase64(key) {
  return encodeBase64(key);
}
export function keyFromBase64(b64) {
  return decodeBase64(b64);
}

// Rastgele tuz üret (base64) — gizli değildir, app_settings'te saklanır
export function generateSaltB64() {
  return encodeBase64(Crypto.getRandomBytes(16));
}

// Metni şifrele → "enc::<base64(nonce+cipher)>". Anahtar yoksa metni olduğu gibi döndürür.
export function encrypt(plaintext) {
  if (!cachedKey || plaintext == null || plaintext === '') return plaintext;
  const nonce = nacl.randomBytes(24);
  const box = nacl.secretbox(decodeUTF8(String(plaintext)), nonce, cachedKey);
  const full = new Uint8Array(nonce.length + box.length);
  full.set(nonce);
  full.set(box, nonce.length);
  return PREFIX + encodeBase64(full);
}

// Şifreli metni çöz. Şifreli değilse (eski/düz veri) olduğu gibi döndürür.
export function decrypt(ciphertext) {
  if (typeof ciphertext !== 'string' || !ciphertext.startsWith(PREFIX)) {
    return ciphertext;
  }
  if (!cachedKey) return '🔒';
  try {
    const full = decodeBase64(ciphertext.slice(PREFIX.length));
    const nonce = full.slice(0, 24);
    const box = full.slice(24);
    const msg = nacl.secretbox.open(box, nonce, cachedKey);
    if (!msg) return '🔒';
    return encodeUTF8(msg);
  } catch {
    return '🔒';
  }
}

// Doğrulama: kurulumda bir kontrol değeri üretilir, katılımda parola doğrulanır.
export function makeCheck() {
  return encrypt(MAGIC);
}
export function verifyCheck(checkCipher) {
  return decrypt(checkCipher) === MAGIC;
}
