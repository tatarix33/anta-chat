import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';

export default function LockScreen({ correctPin, onUnlock, biometricsEnabled = true }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  // Cihaza göre değişen biyometrik etiket/ikon (Face ID, Parmak İzi, vb.)
  const [biometricLabel, setBiometricLabel] = useState('Biyometrik ile Giriş Yap');
  const [biometricIcon, setBiometricIcon] = useState('finger-print-sharp');
  const shakeAnimation = useState(new Animated.Value(0))[0];

  // Biyometrik desteği kontrol et ve varsa otomatik başlat
  useEffect(() => {
    if (!biometricsEnabled) {
      setHasBiometrics(false);
      return;
    }

    const checkBiometrics = async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (hasHardware && isEnrolled) {
          setHasBiometrics(true);

          // Cihazda hangi biyometrik tür kayıtlıysa etiketi/ikonu ona göre ayarla
          try {
            const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
            const { FACIAL_RECOGNITION, FINGERPRINT, IRIS } = LocalAuthentication.AuthenticationType;
            let label = 'Biyometrik ile Giriş Yap';
            let icon = 'finger-print-sharp';
            if (Platform.OS === 'ios') {
              if (types.includes(FACIAL_RECOGNITION)) { label = 'Face ID ile Giriş Yap'; icon = 'scan-outline'; }
              else { label = 'Touch ID ile Giriş Yap'; icon = 'finger-print-sharp'; }
            } else {
              if (types.includes(FINGERPRINT)) { label = 'Parmak İzi ile Giriş Yap'; icon = 'finger-print-sharp'; }
              else if (types.includes(FACIAL_RECOGNITION)) { label = 'Yüz Tanıma ile Giriş Yap'; icon = 'scan-outline'; }
              else if (types.includes(IRIS)) { label = 'İris ile Giriş Yap'; icon = 'eye-outline'; }
            }
            setBiometricLabel(label);
            setBiometricIcon(icon);
          } catch (typeErr) {
            console.log('Biyometrik tür belirlenemedi:', typeErr);
          }

          // Kısa bir bekleme ekleyerek ekranın tam yüklendiğinden emin olalım
          setTimeout(() => {
            authenticateBiometrics();
          }, 350);
        }
      } catch (err) {
        console.error('Biyometrik doğrulama desteği kontrol hatası:', err);
      }
    };
    checkBiometrics();
  }, [biometricsEnabled]);

  const authenticateBiometrics = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'ANTA Chat Tünel Kilidini Aç',
        fallbackLabel: 'PIN Şifresi Kullan',
        disableDeviceFallback: true,
      });

      if (result.success) {
        onUnlock();
      }
    } catch (err) {
      console.error('Biyometrik doğrulama sırasında hata:', err);
    }
  };

  useEffect(() => {
    if (pin.length === 4) {
      if (pin === correctPin) {
        setError(false);
        onUnlock();
      } else {
        setError(true);
        triggerShake();
        setPin(''); // Reset on error
      }
    }
  }, [pin]);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleKeyPress = (num) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError(false);
    }
  };

  const handleBackspace = () => {
    if (pin.length > 0) {
      setPin(prev => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    setPin('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="shield-checkmark-sharp" size={72} color="#00FF87" style={styles.shieldIcon} />
        <Text style={styles.title}>ANTA SECURE KEY</Text>
        <Text style={styles.subtitle}>Gizli sohbet odasına erişmek için PIN girin</Text>
      </View>

      <Animated.View 
        style={[
          styles.pinDisplayContainer, 
          { transform: [{ translateX: shakeAnimation }] }
        ]}
      >
        {[0, 1, 2, 3].map((index) => (
          <View 
            key={index} 
            style={[
              styles.pinDot, 
              pin.length > index ? styles.pinDotFilled : null,
              error ? styles.pinDotError : null
            ]} 
          />
        ))}
      </Animated.View>

      {error && <Text style={styles.errorText}>Hatalı PIN, lütfen tekrar deneyin.</Text>}

      {/* Biyometrik Doğrulama Manuel Tetikleme Butonu */}
      {hasBiometrics && (
        <TouchableOpacity style={styles.biometricBtn} onPress={authenticateBiometrics} activeOpacity={0.8}>
          <Ionicons name={biometricIcon} size={22} color="#00FF87" />
          <Text style={styles.biometricBtnText}>{biometricLabel}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.keypad}>
        <View style={styles.row}>
          {['1', '2', '3'].map(num => (
            <TouchableOpacity key={num} style={styles.key} onPress={() => handleKeyPress(num)}>
              <Text style={styles.keyText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          {['4', '5', '6'].map(num => (
            <TouchableOpacity key={num} style={styles.key} onPress={() => handleKeyPress(num)}>
              <Text style={styles.keyText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          {['7', '8', '9'].map(num => (
            <TouchableOpacity key={num} style={styles.key} onPress={() => handleKeyPress(num)}>
              <Text style={styles.keyText}>{num}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          <TouchableOpacity style={styles.keyAction} onPress={handleClear}>
            <Text style={styles.keyActionText}>C</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('0')}>
            <Text style={styles.keyText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.keyAction} onPress={handleBackspace}>
            <Ionicons name="backspace-outline" size={24} color="#D1D5DB" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 50,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
  },
  shieldIcon: {
    marginBottom: 20,
    shadowColor: '#00FF87',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F3F4F6',
    letterSpacing: 3,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  pinDisplayContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 30,
    gap: 24,
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#374151',
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    backgroundColor: '#00FF87',
    borderColor: '#00FF87',
    shadowColor: '#00FF87',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  pinDotError: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  keypad: {
    width: '85%',
    maxWidth: 320,
    marginBottom: 20,
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  key: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  keyText: {
    fontSize: 28,
    color: '#F3F4F6',
    fontWeight: '600',
  },
  keyAction: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyActionText: {
    fontSize: 22,
    color: '#9CA3AF',
    fontWeight: 'bold',
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 255, 135, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.15)',
    marginVertical: 10,
  },
  biometricBtnText: {
    fontSize: 13,
    color: '#00FF87',
    fontWeight: '600',
  },
});
