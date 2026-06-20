import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  Modal, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  Switch,
  ScrollView,
  Alert,
  ActivityIndicator,
  Pressable
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsModal({ 
  visible, 
  onClose, 
  username, 
  correctPin, 
  biometricsEnabled,
  onUpdateSettings,
  onLogout,
  onSignOut,
  onDeleteAllChat
}) {
  const [newUsername, setNewUsername] = useState(username);
  const [newPin, setNewPin] = useState(correctPin);
  const [biometrics, setBiometrics] = useState(biometricsEnabled);
  const [error, setError] = useState('');

  // "Tüm sohbeti sil" akışı (PIN doğrulama + onay)
  const [showDeleteOverlay, setShowDeleteOverlay] = useState(false);
  const [deletePin, setDeletePin] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Prop veya görünürlük değiştiğinde senkronize et
  useEffect(() => {
    if (visible) {
      setNewUsername(username);
      setNewPin(correctPin);
      setBiometrics(biometricsEnabled);
      // Silme akışını her açılışta sıfırla
      setShowDeleteOverlay(false);
      setDeletePin('');
      setDeleteError('');
      setDeleting(false);
    }
  }, [visible, biometricsEnabled, username, correctPin]);

  // Tüm sohbeti silme akışı: PIN doğrula → "emin misiniz" → sil
  const handleDeleteChatPress = () => {
    if (deletePin !== correctPin) {
      setDeleteError('Giriş şifresi (PIN) hatalı.');
      return;
    }
    setDeleteError('');
    Alert.alert(
      'Emin misiniz?',
      'Tüm sohbet geçmişi her iki cihazdan da kalıcı olarak silinecek. Bu işlem GERİ ALINAMAZ.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Hepsini Sil',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await onDeleteAllChat();
              setShowDeleteOverlay(false);
              setDeletePin('');
              Alert.alert('Tamamlandı', 'Tüm sohbet silindi.');
            } catch (err) {
              console.error('Sohbet silinemedi:', err);
              Alert.alert('Hata', 'Sohbet silinemedi. Bağlantını kontrol edip tekrar dene.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleSave = () => {
    const trimmedUser = newUsername.trim();
    if (!trimmedUser) {
      setError('Kullanıcı adı boş olamaz.');
      return;
    }
    if (newPin.length !== 4 || isNaN(newPin)) {
      setError('PIN 4 haneli bir sayı olmalıdır.');
      return;
    }

    setError('');
    onUpdateSettings(trimmedUser, newPin, biometrics);
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>ANTA AYARLAR</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close-sharp" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardView}
          >
            <ScrollView
              style={styles.content}
              contentContainerStyle={styles.contentInner}
              keyboardShouldPersistTaps="handled"
            >
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>PROFIL AYARLARI</Text>
                  
                  <Text style={styles.label}>Kullanıcı Adı</Text>
                  <TextInput
                    style={styles.input}
                    value={newUsername}
                    onChangeText={(text) => {
                      setNewUsername(text);
                      setError('');
                    }}
                    maxLength={20}
                    placeholderTextColor="#4B5563"
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>GÜVENLİK AYARLARI</Text>
                  
                  <Text style={styles.label}>Uygulama Giriş Şifresi (4 Haneli PIN)</Text>
                  <TextInput
                    style={styles.input}
                    value={newPin}
                    onChangeText={(text) => {
                      setNewPin(text.replace(/[^0-9]/g, ''));
                      setError('');
                    }}
                    maxLength={4}
                    keyboardType="numeric"
                    secureTextEntry={true}
                    placeholder="Yeni PIN"
                    placeholderTextColor="#4B5563"
                  />

                  <View style={styles.toggleRow}>
                    <View>
                      <Text style={styles.toggleLabel}>Biyometrik Kilit (Face ID / Parmak İzi)</Text>
                      <Text style={styles.toggleSub}>Uygulamayı biyometrik veriyle hızlıca açın.</Text>
                    </View>
                    <Switch
                      trackColor={{ false: '#1F2937', true: '#059669' }}
                      thumbColor={biometrics ? '#00FF87' : '#9CA3AF'}
                      onValueChange={setBiometrics}
                      value={biometrics}
                    />
                  </View>
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                  <Text style={styles.saveButtonText}>Değişiklikleri Kaydet</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.lockButton} onPress={onLogout}>
                  <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
                  <Text style={styles.lockButtonText}>Uygulamayı Kilitle</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.logoutButton} onPress={onSignOut}>
                  <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                  <Text style={styles.logoutButtonText}>Hesaptan Çıkış Yap</Text>
                </TouchableOpacity>

                <View style={styles.dangerSection}>
                  <Text style={styles.dangerTitle}>TEHLİKELİ BÖLGE</Text>
                  <TouchableOpacity
                    style={styles.deleteChatButton}
                    onPress={() => {
                      setDeletePin('');
                      setDeleteError('');
                      setShowDeleteOverlay(true);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    <Text style={styles.deleteChatButtonText}>Tüm Sohbeti Sil</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>

          {showDeleteOverlay && (
            <View style={styles.deleteOverlay}>
              {/* Arka plana basınca kapat */}
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => { if (!deleting) setShowDeleteOverlay(false); }}
              />
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.deleteKav}
                pointerEvents="box-none"
              >
              <Pressable style={styles.deleteCard} onPress={() => {}}>
                <TouchableOpacity
                  style={styles.deleteCloseBtn}
                  onPress={() => { if (!deleting) setShowDeleteOverlay(false); }}
                  disabled={deleting}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={22} color="#9CA3AF" />
                </TouchableOpacity>
                <View style={styles.deleteIconCircle}>
                  <Ionicons name="warning-outline" size={28} color="#EF4444" />
                </View>
                <Text style={styles.deleteCardTitle}>Tüm Sohbeti Sil</Text>
                <Text style={styles.deleteCardDesc}>
                  Devam etmek için giriş şifreni (4 haneli PIN) gir. Onayladıktan sonra
                  tüm mesajlar her iki cihazdan da kalıcı olarak silinecek.
                </Text>

                <TextInput
                  style={styles.deletePinInput}
                  value={deletePin}
                  onChangeText={(t) => {
                    setDeletePin(t.replace(/[^0-9]/g, ''));
                    setDeleteError('');
                  }}
                  maxLength={4}
                  keyboardType="numeric"
                  secureTextEntry
                  placeholder="• • • •"
                  placeholderTextColor="#4B5563"
                  textAlign="center"
                  autoFocus
                  editable={!deleting}
                />

                {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}

                <TouchableOpacity
                  style={[styles.deleteConfirmButton, deletePin.length !== 4 && styles.deleteConfirmDisabled]}
                  onPress={handleDeleteChatPress}
                  disabled={deletePin.length !== 4 || deleting}
                >
                  {deleting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.deleteConfirmText}>Sohbeti Sil</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteCancelButton}
                  onPress={() => setShowDeleteOverlay(false)}
                  disabled={deleting}
                >
                  <Text style={styles.deleteCancelText}>Vazgeç</Text>
                </TouchableOpacity>
              </Pressable>
              </KeyboardAvoidingView>
            </View>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    height: '85%',
    backgroundColor: '#0B0F19',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderColor: '#1F2937',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#F3F4F6',
    letterSpacing: 2,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 24,
    gap: 24,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#00FF87',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  input: {
    height: 50,
    borderRadius: 10,
    backgroundColor: '#111827',
    borderColor: '#1F2937',
    borderWidth: 1.5,
    paddingHorizontal: 16,
    color: '#F3F4F6',
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#111827',
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F3F4F6',
  },
  toggleSub: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  saveButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#00FF87',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#00FF87',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  saveButtonText: {
    fontSize: 15,
    color: '#0B0F19',
    fontWeight: '700',
  },
  lockButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#1F2937',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  lockButtonText: {
    fontSize: 15,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  logoutButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  logoutButtonText: {
    fontSize: 15,
    color: '#EF4444',
    fontWeight: '700',
  },
  dangerSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: '#1F2937',
    gap: 12,
  },
  dangerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 1.5,
  },
  deleteChatButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteChatButtonText: {
    fontSize: 15,
    color: '#EF4444',
    fontWeight: '700',
  },
  deleteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 7, 18, 0.92)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  deleteKav: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  deleteCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 4,
    zIndex: 2,
  },
  deleteCard: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 24,
    alignItems: 'center',
  },
  deleteIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  deleteCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F3F4F6',
    marginBottom: 8,
  },
  deleteCardDesc: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  deletePinInput: {
    width: '60%',
    height: 56,
    borderRadius: 12,
    backgroundColor: '#0B0F19',
    borderWidth: 1.5,
    borderColor: '#1F2937',
    color: '#F3F4F6',
    fontSize: 24,
    letterSpacing: 8,
    marginBottom: 8,
  },
  deleteConfirmButton: {
    width: '100%',
    height: 52,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  deleteConfirmDisabled: {
    backgroundColor: '#374151',
  },
  deleteConfirmText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  deleteCancelButton: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  deleteCancelText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '600',
  },
});
