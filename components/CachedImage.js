// ANTA Chat - Önbellekli Resim Bileşeni (expo-image tabanlı)
// Dosya Yolu: anta-chat/components/CachedImage.js
//
// expo-image otomatik bellek + disk önbelleği yapar:
//  - Önbellekteki resim ANINDA açılır (spinner yanıp sönmesi yok).
//  - placeholder verilirse (ör. thumbnail) önce o gösterilir, net hali
//    arka planda yüklenip yumuşak geçişle (transition) belirir.
//  - Çevrimdışı güvenilir çalışır.
// API, eski elle-önbellekli sürümle aynı tutuldu ki çağrı yerleri değişmesin.

import React from 'react';
import { Image } from 'expo-image';

// RN resizeMode → expo-image contentFit eşlemesi
const toContentFit = (resizeMode) => {
  switch (resizeMode) {
    case 'contain':
      return 'contain';
    case 'stretch':
      return 'fill';
    case 'center':
      return 'none';
    default:
      return 'cover';
  }
};

export default function CachedImage({
  uri,
  style,
  resizeMode,
  onError,
  placeholder, // opsiyonel: önce gösterilecek küçük önizleme (thumbnail) uri'si
  transition = 150,
}) {
  return (
    <Image
      source={uri ? { uri } : null}
      placeholder={placeholder ? { uri: placeholder } : undefined}
      style={style}
      contentFit={toContentFit(resizeMode)}
      cachePolicy="memory-disk"
      transition={transition}
      // expo-image onError olayı { error } verir; eski çağrı yerleri
      // e.nativeEvent.error bekliyor — uyumlu hale getiriyoruz.
      onError={onError ? (e) => onError({ nativeEvent: { error: e?.error } }) : undefined}
    />
  );
}
