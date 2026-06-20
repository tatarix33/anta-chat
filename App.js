import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { supabase } from './supabase';
import LockScreen from './components/LockScreen';
import AuthScreen from './components/AuthScreen';
import ProfileSetup from './components/ProfileSetup';
import MainTabs from './components/MainTabs';
import SettingsModal from './components/SettingsModal';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync } from './notificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import E2ESetupScreen from './components/E2ESetupScreen';
import { setKey, keyFromBase64 } from './crypto';

const SHOW_BLUE_BUILD_TEST_SCREEN = false;

function AppContent() {
  const [correctPin, setCorrectPin] = useState('1234');
  const [username, setUsername] = useState('');
  const [isLocked, setIsLocked] = useState(true);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [useBiometrics, setUseBiometrics] = useState(true);
  
  // Auth ve Oturum Durumları
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  // Uçtan uca şifreleme (E2E) durumu
  const [e2eReady, setE2eReady] = useState(false);
  const [e2eChecked, setE2eChecked] = useState(false);

  // Biyometrik Tercihini Yerel Hafızadan Yükle
  useEffect(() => {
    const loadBiometricsSetting = async () => {
      try {
        const value = await AsyncStorage.getItem('use_biometrics');
        if (value !== null) {
          setUseBiometrics(value === 'true');
        }
      } catch (err) {
        console.log('Biyometrik ayarı yüklenemedi:', err);
      }
    };
    loadBiometricsSetting();
  }, []);

  // Önbellekteki kullanıcı adını hemen yükle: açılış ağ isteğini beklemeden
  // (kilit açıldığında) MainTabs doğru adla, çevrimdışı bile açılabilsin.
  useEffect(() => {
    AsyncStorage.getItem('cached_username')
      .then((u) => {
        if (u) setUsername((curr) => curr || u);
      })
      .catch(() => {});
  }, []);

  // Cihazda kayıtlı E2E şifreleme anahtarını yükle
  useEffect(() => {
    const loadKey = async () => {
      try {
        const b64 = await SecureStore.getItemAsync('e2e_key');
        if (b64) {
          setKey(keyFromBase64(b64));
          setE2eReady(true);
        }
      } catch (err) {
        console.log('E2E anahtarı yüklenemedi:', err);
      } finally {
        setE2eChecked(true);
      }
    };
    loadKey();
  }, []);

  // 1. Supabase Oturum Durumunu Dinle
  useEffect(() => {
    // Güvenlik ağı: ne olursa olsun en geç 10sn sonra yükleme ekranından çık
    // (getSession/ağ takılırsa splash'te kalmasın)
    const safetyTimer = setTimeout(() => {
      setLoading(false);
      setE2eChecked(true);
    }, 10000);

    // Mevcut oturumu kontrol et
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        if (session?.user) {
          setIsLocked(true); // Aktif oturum var, kilitle
          // Splash'i HEMEN kapat: kilit ekranını göster, profili arka planda çek.
          // Böylece açılış ağ isteğine takılıp 10sn bekleme yapmaz.
          setLoading(false);
          fetchProfile(session.user.id);
        } else {
          setIsLocked(false); // Oturum yok, kilidi aç (AuthScreen gösterilsin)
          setLoading(false);
        }
      })
      .catch((err) => {
        // Oturum okunamadıysa kilidi aç ve yüklemeyi bitir (takılı kalma)
        console.log('getSession hatası, AuthScreen gösteriliyor:', err);
        setIsLocked(false);
        setLoading(false);
      });

    // Oturum değişikliklerini canlı dinle
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) {
        if (event === 'SIGNED_IN') {
          setIsLocked(false); // Yeni giriş/kayıt yapıldıysa kilidi aç, direkt girsin
        }
        fetchProfile(session.user.id);
      } else {
        setIsLocked(false); // Oturum kapandıysa kilidi aç ki AuthScreen gösterilsin
        setUsername('');
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  // 2. Supabase'den paylaşılan PIN şifresini çek ve anlık değişiklikleri dinle
  useEffect(() => {
    const getStoredPin = async () => {
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'lock_pin')
          .maybeSingle();
        
        if (data && data.value && !error) {
          setCorrectPin(data.value);
        }
      } catch (err) {
        console.log('PIN veritabanı okuma hatası, varsayılan (1234) kullanılıyor:', err);
      }
    };
    getStoredPin();

    const subscription = supabase
      .channel('public:app_settings')
      .on(
        'postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'app_settings', filter: 'key=eq.lock_pin' }, 
        (payload) => {
          if (payload.new && payload.new.value) {
            setCorrectPin(payload.new.value);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  // 3. Push Bildirim Kaydı ve Dinleyicileri
  useEffect(() => {
    let notificationListener;
    let responseListener;

    if (session?.user && username) {
      const setupNotifications = async () => {
        try {
          const token = await registerForPushNotificationsAsync();
          if (token) {
            const { error } = await supabase
              .from('profiles')
              .update({ push_token: token })
              .eq('id', session.user.id);
            if (error) {
              console.log('Push Token veritabanına kaydedilemedi:', error);
            } else {
              console.log('Push Token başarıyla veritabanına güncellendi.');
            }
          }
        } catch (err) {
          console.log('Bildirim kurulumu sırasında hata:', err);
        }
      };

      setupNotifications();

      // Uygulama ön plandayken bildirim gelirse dinle
      notificationListener = Notifications.addNotificationReceivedListener(notification => {
        console.log('Ön planda bildirim alındı:', notification);
      });

      // Kullanıcı bildirime tıkladığında tetiklenir
      responseListener = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Bildirime tıklandı:', response);
      });
    }

    return () => {
      if (notificationListener) {
        Notifications.removeNotificationSubscription(notificationListener);
      }
      if (responseListener) {
        Notifications.removeNotificationSubscription(responseListener);
      }
    };
  }, [session, username]);

  // Kullanıcı profilinden kullanıcı adını çek
  const fetchProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      if (data && data.username) {
        setUsername(data.username);
        // Sonraki açılışlarda anında/çevrimdışı kullanmak için önbelleğe al
        AsyncStorage.setItem('cached_username', data.username).catch(() => {});
      }
      // data yoksa (profil henüz oluşmamış) username'i SIFIRLAMA —
      // önbellekten/eski değerden gelen korunur, yeni kullanıcıda zaten '' kalır.
    } catch (err) {
      // Ağ hatası: mevcut/önbellekteki kullanıcı adını KORU, sıfırlama.
      // (Aksi halde internet kötüyken kullanıcı ProfileSetup'a düşüyordu.)
      console.error('Profil çekilirken hata oluştu:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = () => {
    setIsLocked(false);
  };

  const handleSaveUsername = (name) => {
    setUsername(name);
  };

  const handleUpdateSettings = async (name, pin, biometricsEnabled) => {
    // 1. PIN güncellemesi (Ortak ayar)
    try {
      await supabase
        .from('app_settings')
        .update({ value: pin, updated_at: new Date() })
        .eq('key', 'lock_pin');
      setCorrectPin(pin);
    } catch (err) {
      console.error('Şifre güncellenirken veritabanına yazılamadı:', err);
    }

    // 2. Kullanıcı adı güncellemesi (Bireysel profil)
    try {
      const user = session?.user;
      if (user && name !== username) {
        const { error } = await supabase
          .from('profiles')
          .update({ username: name })
          .eq('id', user.id);

        if (error) {
          if (error.code === '23505') {
            Alert.alert('Profil Hatası', 'Bu kullanıcı adı başka bir üye tarafından alınmış.');
            return;
          }
          throw error;
        }
        setUsername(name);
      }
    } catch (err) {
      console.error('Kullanıcı adı güncellenirken hata oluştu:', err);
      Alert.alert('Hata', 'Kullanıcı adı güncellenemedi.');
    }

    // 3. Biyometrik Tercihini Güncelle
    try {
      setUseBiometrics(biometricsEnabled);
      await AsyncStorage.setItem('use_biometrics', biometricsEnabled ? 'true' : 'false');
    } catch (err) {
      console.error('Biyometrik tercihi kaydedilemedi:', err);
    }
  };

  const handleLogout = () => {
    // Sadece uygulamayı kilitle (PIN ekranına at ama oturumu kapatma)
    setSettingsVisible(false);
    setIsLocked(true);
  };

  const handleSignOut = async () => {
    // Tamamen oturumu kapat (Supabase Auth logout yap ve kilitle)
    try {
      setSettingsVisible(false);
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await AsyncStorage.removeItem('cached_username').catch(() => {});
      setUsername('');
      setIsLocked(true);
    } catch (err) {
      console.error('Çıkış yapılırken hata oluştu:', err);
      Alert.alert('Çıkış Hatası', 'Oturum kapatılamadı.');
    } finally {
      setLoading(false);
    }
  };

  // Tüm sohbeti sil (her iki cihazdan). messages tablosundaki tüm satırları siler.
  // PIN doğrulaması ve "emin misiniz" onayı SettingsModal içinde yapılır.
  const handleDeleteAllChat = async () => {
    const { error } = await supabase
      .from('messages')
      .delete()
      .not('id', 'is', null); // Supabase delete bir filtre ister; tüm satırları kapsar
    if (error) throw error;
  };

  if (loading || !e2eChecked) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00FF87" />
      </View>
    );
  }

  return (
    <KeyboardProvider>
      <SafeAreaProvider style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.innerContainer}>
        {session && isLocked ? (
          <LockScreen 
            correctPin={correctPin} 
            onUnlock={handleUnlock} 
            biometricsEnabled={useBiometrics}
          />
        ) : !session ? (
          <AuthScreen />
        ) : !username ? (
          <ProfileSetup
            onSave={handleSaveUsername}
          />
        ) : !e2eReady ? (
          <E2ESetupScreen onReady={() => setE2eReady(true)} />
        ) : (
          <>
            <MainTabs
              username={username}
              onOpenSettings={() => setSettingsVisible(true)}
            />
            <SettingsModal 
              visible={settingsVisible}
              onClose={() => setSettingsVisible(false)}
              username={username}
              correctPin={correctPin}
              biometricsEnabled={useBiometrics}
              onUpdateSettings={handleUpdateSettings}
              onLogout={handleLogout}
              onSignOut={handleSignOut}
              onDeleteAllChat={handleDeleteAllChat}
            />
          </>
        )}
        </View>
      </SafeAreaProvider>
    </KeyboardProvider>
  );
}

export default function App() {
  return SHOW_BLUE_BUILD_TEST_SCREEN ? (
    <View style={styles.blueBuildTestScreen} />
  ) : (
    <AppContent />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  innerContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0B0F19',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blueBuildTestScreen: {
    flex: 1,
    backgroundColor: '#0057FF',
  },
});
