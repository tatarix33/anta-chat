import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';

export default function ProfileSetup({ onSave }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    const trimmed = username.trim();
    if (!trimmed) {
      setError('Kullanıcı adı boş bırakılamaz.');
      return;
    }
    if (trimmed.length < 3) {
      setError('Kullanıcı adı en az 3 karakter olmalıdır.');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Oturum bulunamadı.');

      const { error: dbError } = await supabase
        .from('profiles')
        .insert([{ id: user.id, username: trimmed }]);

      if (dbError) {
        if (dbError.code === '23505') {
          setError('Bu kullanıcı adı zaten alınmış. Lütfen başka bir ad girin.');
          setLoading(false);
          return;
        }
        throw dbError;
      }

      onSave(trimmed);
    } catch (err) {
      console.error('Kullanıcı adı kaydedilemedi:', err);
      setError('Kullanıcı adı kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.');
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
          <View style={styles.header}>
            <Ionicons name="person-circle-sharp" size={80} color="#00FF87" style={styles.profileIcon} />
            <Text style={styles.title}>Kullanıcı Profili</Text>
            <Text style={styles.subtitle}>Sohbette görünecek kullanıcı adınızı girin.</Text>
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, error ? styles.inputError : null]}
              placeholder="Kullanıcı Adı"
              placeholderTextColor="#4B5563"
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                setError('');
              }}
              autoFocus
              maxLength={20}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <TouchableOpacity 
            style={[styles.button, loading ? styles.buttonDisabled : null]} 
            onPress={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#0B0F19" />
            ) : (
              <>
                <Text style={styles.buttonText}>Sohbete Giriş Yap</Text>
                <Ionicons name="arrow-forward-outline" size={20} color="#0B0F19" />
              </>
            )}
          </TouchableOpacity>
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
    justifyContent: 'space-between',
    paddingVertical: 40,
    paddingHorizontal: 30,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
  },
  profileIcon: {
    marginBottom: 20,
    shadowColor: '#00FF87',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#F3F4F6',
    letterSpacing: 2,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  inputContainer: {
    width: '100%',
    marginVertical: 40,
  },
  input: {
    width: '100%',
    height: 56,
    borderRadius: 12,
    backgroundColor: '#111827',
    borderColor: '#1F2937',
    borderWidth: 1.5,
    paddingHorizontal: 16,
    color: '#F3F4F6',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    height: 54,
    borderRadius: 12,
    backgroundColor: '#00FF87',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#00FF87',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 16,
    color: '#0B0F19',
    fontWeight: '700',
  },
});
