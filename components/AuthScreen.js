import React, { useState } from 'react';
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
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleAuth = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert('Eksik Bilgi', 'Lütfen tüm alanları doldurun.');
      return;
    }

    if (trimmedPassword.length < 6) {
      Alert.alert('Zayıf Şifre', 'Şifre en az 6 karakterden oluşmalıdır.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        // Kayıt Olma Akışı
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
        });

        if (error) throw error;
        
        Alert.alert(
          'Kayıt Başarılı', 
          'Hesabınız başarıyla oluşturuldu. E-postanıza gelen doğrulama bağlantısını onayladıktan sonra (veya doğrulama kapalıysa doğrudan) giriş yapabilirsiniz.',
          [{ text: 'Tamam' }]
        );
      } else {
        // Giriş Yapma Akışı
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });

        if (error) throw error;
      }
    } catch (err) {
      console.error('Kimlik doğrulama hatası:', err);
      Alert.alert(
        isSignUp ? 'Kayıt Hatası' : 'Giriş Hatası',
        err.message || 'Kimlik doğrulama işlemi sırasında beklenmedik bir hata oluştu.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo & Başlık */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="finger-print-sharp" size={72} color="#00FF87" style={styles.icon} />
            </View>
            <Text style={styles.title}>ANTA AUTHENTICATION</Text>
            <Text style={styles.subtitle}>
              {isSignUp ? 'Güvenli tünele katılmak için kayıt olun' : 'Korumalı kanala erişmek için oturum açın'}
            </Text>
          </View>

          {/* Form Alanları */}
          <View style={styles.form}>
            {/* E-posta Alanı */}
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#4B5563" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="E-posta Adresi"
                placeholderTextColor="#4B5563"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Şifre Alanı */}
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#4B5563" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Şifre"
                placeholderTextColor="#4B5563"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity 
                style={styles.passwordToggle} 
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons 
                  name={showPassword ? "eye-off-outline" : "eye-outline"} 
                  size={20} 
                  color="#9CA3AF" 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Butonlar & Kontroller */}
          <View style={styles.footer}>
            <TouchableOpacity 
              style={[styles.button, loading ? styles.buttonDisabled : null]} 
              onPress={handleAuth}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#0B0F19" />
              ) : (
                <>
                  <Text style={styles.buttonText}>
                    {isSignUp ? 'Kayıt Ol ve Katıl' : 'Tüneli Aç / Giriş Yap'}
                  </Text>
                  <Ionicons name="shield-checkmark" size={18} color="#0B0F19" />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.toggleBtn} 
              onPress={() => setIsSignUp(!isSignUp)}
              disabled={loading}
            >
              <Text style={styles.toggleText}>
                {isSignUp 
                  ? 'Zaten bir hesabınız var mı? Giriş Yapın' 
                  : 'Henüz hesabınız yok mu? Yeni Hesap Oluşturun'}
              </Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(0, 255, 135, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#00FF87',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  icon: {
    shadowColor: '#00FF87',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#F3F4F6',
    letterSpacing: 2,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  form: {
    width: '100%',
    marginVertical: 30,
    gap: 16,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 52,
    borderRadius: 12,
    backgroundColor: '#111827',
    borderColor: '#1F2937',
    borderWidth: 1.5,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#F3F4F6',
    fontSize: 15,
    height: '100%',
  },
  passwordToggle: {
    padding: 4,
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  button: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    backgroundColor: '#00FF87',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#00FF87',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 15,
    color: '#0B0F19',
    fontWeight: '700',
  },
  toggleBtn: {
    paddingVertical: 8,
  },
  toggleText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
});
