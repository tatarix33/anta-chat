// ANTA Chat - Kasa (Vault) Ekranı
// Notlar + Dosyalar + Şifre/Hesap Kayıtları
// Dosya Yolu: anta-chat/components/VaultScreen.js

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { FileSystemUploadType } from 'expo-file-system/legacy';
import { supabase } from '../supabase';
import { encrypt, decrypt } from '../crypto';

const SEGMENTS = [
  { key: 'notes', label: 'Notlar', icon: 'document-text' },
  { key: 'files', label: 'Dosyalar', icon: 'folder' },
  { key: 'secrets', label: 'Kayıtlar', icon: 'key' },
];

// Dosya boyutunu okunur hale getir
const formatSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

export default function VaultScreen({ username, onOpenSettings }) {
  const [segment, setSegment] = useState('notes');

  const [notes, setNotes] = useState([]);
  const [files, setFiles] = useState([]);
  const [secrets, setSecrets] = useState([]);

  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Not düzenleme modalı
  const [noteModal, setNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null); // { id?, title, content }

  // Kayıt (secret) düzenleme modalı
  const [secretModal, setSecretModal] = useState(false);
  const [editingSecret, setEditingSecret] = useState(null); // { id?, title, account, secret, note }
  const [revealed, setRevealed] = useState({}); // { [id]: true }

  // ---- Veri Çekme ----
  const fetchNotes = useCallback(async () => {
    const { data, error } = await supabase
      .from('vault_notes')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && data) {
      setNotes(data.map((n) => ({ ...n, title: decrypt(n.title), content: decrypt(n.content) })));
    }
  }, []);

  const fetchFiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('vault_files')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setFiles(data.map((f) => ({ ...f, name: decrypt(f.name) })));
    }
  }, []);

  const fetchSecrets = useCallback(async () => {
    const { data, error } = await supabase
      .from('vault_secrets')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && data) {
      setSecrets(
        data.map((s) => ({
          ...s,
          title: decrypt(s.title),
          account: decrypt(s.account),
          secret: decrypt(s.secret),
          note: decrypt(s.note),
        }))
      );
    }
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      await Promise.all([fetchNotes(), fetchFiles(), fetchSecrets()]);
    } catch (err) {
      console.error('Kasa verileri yüklenemedi:', err);
    }
  }, [fetchNotes, fetchFiles, fetchSecrets]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  // ---- NOTLAR ----
  const openNewNote = () => {
    setEditingNote({ title: '', content: '' });
    setNoteModal(true);
  };

  const openNote = (note) => {
    setEditingNote({ id: note.id, title: note.title || '', content: note.content || '' });
    setNoteModal(true);
  };

  const saveNote = async () => {
    if (!editingNote) return;
    const title = editingNote.title.trim();
    const content = editingNote.content.trim();
    if (!title && !content) {
      setNoteModal(false);
      return;
    }
    try {
      if (editingNote.id) {
        await supabase
          .from('vault_notes')
          .update({ title: encrypt(title), content: encrypt(content), updated_at: new Date() })
          .eq('id', editingNote.id);
      } else {
        await supabase
          .from('vault_notes')
          .insert([{ title: encrypt(title), content: encrypt(content), author: username || 'Anonim' }]);
      }
      setNoteModal(false);
      setEditingNote(null);
      fetchNotes();
    } catch (err) {
      console.error('Not kaydedilemedi:', err);
      Alert.alert('Hata', 'Not kaydedilemedi.');
    }
  };

  const deleteNote = (note) => {
    Alert.alert('Notu Sil', 'Bu not silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('vault_notes').delete().eq('id', note.id);
          setNoteModal(false);
          setEditingNote(null);
          fetchNotes();
        },
      },
    ]);
  };

  // ---- DOSYALAR ----
  const pickAndUploadFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const asset = res.assets[0]; // { uri, name, size, mimeType }
      setUploading(true);

      const contentType = asset.mimeType || 'application/octet-stream';

      // 1. R2 pre-signed URL al
      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('r2-uploader', {
        body: { filename: asset.name || `dosya_${Date.now()}`, contentType },
      });
      if (edgeError || !edgeData) {
        throw new Error(edgeError?.message || 'Yükleme adresi üretilemedi.');
      }

      // 2. Doğrudan R2'ye yükle
      const uploadResult = await FileSystem.uploadAsync(edgeData.uploadUrl, asset.uri, {
        httpMethod: 'PUT',
        headers: { 'Content-Type': contentType },
        uploadType: FileSystemUploadType.BINARY_CONTENT,
      });
      if (uploadResult.status !== 200 && uploadResult.status !== 201) {
        throw new Error(`Dosya yüklenemedi. Durum: ${uploadResult.status}`);
      }

      // 3. Üst veriyi DB'ye yaz
      const { error: dbError } = await supabase.from('vault_files').insert([
        {
          name: encrypt(asset.name || 'dosya'),
          url: edgeData.publicUrl,
          size: asset.size || null,
          mime_type: contentType,
          author: username || 'Anonim',
        },
      ]);
      if (dbError) throw dbError;

      fetchFiles();
    } catch (err) {
      console.error('Dosya yüklenemedi:', err);
      Alert.alert('Yükleme Başarısız', err.message || 'Dosya yüklenirken bir sorun oluştu.');
    } finally {
      setUploading(false);
    }
  };

  const openFile = async (file) => {
    try {
      await Linking.openURL(file.url);
    } catch (err) {
      Alert.alert('Hata', 'Dosya açılamadı.');
    }
  };

  const deleteFile = (file) => {
    Alert.alert('Dosyayı Sil', `"${file.name}" kayıttan silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('vault_files').delete().eq('id', file.id);
          fetchFiles();
        },
      },
    ]);
  };

  // ---- KAYITLAR (SECRETS) ----
  const openNewSecret = () => {
    setEditingSecret({ title: '', account: '', secret: '', note: '' });
    setSecretModal(true);
  };

  const openSecret = (s) => {
    setEditingSecret({
      id: s.id,
      title: s.title || '',
      account: s.account || '',
      secret: s.secret || '',
      note: s.note || '',
    });
    setSecretModal(true);
  };

  const saveSecret = async () => {
    if (!editingSecret) return;
    const title = editingSecret.title.trim();
    if (!title) {
      Alert.alert('Eksik Bilgi', 'Başlık zorunludur.');
      return;
    }
    const payload = {
      title: encrypt(title),
      account: encrypt(editingSecret.account.trim()),
      secret: encrypt(editingSecret.secret),
      note: encrypt(editingSecret.note.trim()),
    };
    try {
      if (editingSecret.id) {
        await supabase
          .from('vault_secrets')
          .update({ ...payload, updated_at: new Date() })
          .eq('id', editingSecret.id);
      } else {
        await supabase
          .from('vault_secrets')
          .insert([{ ...payload, author: username || 'Anonim' }]);
      }
      setSecretModal(false);
      setEditingSecret(null);
      fetchSecrets();
    } catch (err) {
      console.error('Kayıt kaydedilemedi:', err);
      Alert.alert('Hata', 'Kayıt kaydedilemedi.');
    }
  };

  const deleteSecret = (s) => {
    Alert.alert('Kaydı Sil', 'Bu kayıt silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('vault_secrets').delete().eq('id', s.id);
          setSecretModal(false);
          setEditingSecret(null);
          fetchSecrets();
        },
      },
    ]);
  };

  const toggleReveal = (id) => {
    setRevealed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // ---- RENDER: Liste öğeleri ----
  const renderNote = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => openNote(item)} activeOpacity={0.8}>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.title || 'Başlıksız not'}
      </Text>
      {item.content ? (
        <Text style={styles.cardBody} numberOfLines={2}>
          {item.content}
        </Text>
      ) : null}
      <Text style={styles.cardMeta}>
        {item.author || '—'} · {formatDate(item.updated_at)}
      </Text>
    </TouchableOpacity>
  );

  const renderFile = ({ item }) => (
    <View style={styles.card}>
      <TouchableOpacity style={styles.fileRow} onPress={() => openFile(item)} activeOpacity={0.8}>
        <View style={styles.fileIcon}>
          <Ionicons name="document-outline" size={22} color="#00FF87" />
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardMeta}>
            {formatSize(item.size)} · {item.author || '—'} · {formatDate(item.created_at)}
          </Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => deleteFile(item)}>
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );

  const renderSecret = ({ item }) => {
    const isRevealed = !!revealed[item.id];
    return (
      <TouchableOpacity style={styles.card} onPress={() => openSecret(item)} activeOpacity={0.8}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {item.account ? (
          <Text style={styles.cardBody} numberOfLines={1}>
            👤 {item.account}
          </Text>
        ) : null}
        <View style={styles.secretRow}>
          <Text style={styles.secretValue} numberOfLines={1}>
            🔑 {isRevealed ? (item.secret || '—') : '••••••••'}
          </Text>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => toggleReveal(item.id)}
          >
            <Ionicons name={isRevealed ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // Aktif segmente göre liste verisi/render
  const listData = segment === 'notes' ? notes : segment === 'files' ? files : secrets;
  const renderItem = segment === 'notes' ? renderNote : segment === 'files' ? renderFile : renderSecret;

  const handleAdd = () => {
    if (segment === 'notes') openNewNote();
    else if (segment === 'files') pickAndUploadFile();
    else openNewSecret();
  };

  const emptyText =
    segment === 'notes' ? 'Henüz not yok' : segment === 'files' ? 'Henüz dosya yok' : 'Henüz kayıt yok';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="lock-closed" size={20} color="#00FF87" />
          <Text style={styles.headerTitle}>Kasa</Text>
        </View>
        <TouchableOpacity style={styles.settingsButton} onPress={onOpenSettings}>
          <Ionicons name="settings-sharp" size={22} color="#00FF87" />
        </TouchableOpacity>
      </View>

      {/* Segment kontrol */}
      <View style={styles.segmentBar}>
        {SEGMENTS.map((seg) => {
          const active = segment === seg.key;
          return (
            <TouchableOpacity
              key={seg.key}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => setSegment(seg.key)}
              activeOpacity={0.8}
            >
              <Ionicons name={seg.icon} size={16} color={active ? '#0B0F19' : '#9CA3AF'} />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {seg.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {uploading && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color="#00FF87" />
          <Text style={styles.uploadingText}>Dosya yükleniyor...</Text>
        </View>
      )}

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FF87" />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="file-tray-outline" size={56} color="#1E293B" />
            <Text style={styles.emptyText}>{emptyText}</Text>
          </View>
        }
      />

      {/* Ekle butonu (FAB) */}
      <TouchableOpacity style={styles.fab} onPress={handleAdd} activeOpacity={0.85}>
        <Ionicons name="add" size={30} color="#0B0F19" />
      </TouchableOpacity>

      {/* NOT MODALI */}
      <Modal visible={noteModal} animationType="slide" transparent onRequestClose={() => setNoteModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%', justifyContent: 'flex-end' }}
          >
            <SafeAreaView style={styles.modalSheet} edges={['bottom']}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setNoteModal(false)}>
                  <Text style={styles.modalCancel}>Vazgeç</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{editingNote?.id ? 'Notu Düzenle' : 'Yeni Not'}</Text>
                <TouchableOpacity onPress={saveNote}>
                  <Text style={styles.modalSave}>Kaydet</Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
                <TextInput
                  style={styles.modalInput}
                  placeholder="Başlık"
                  placeholderTextColor="#4B5563"
                  value={editingNote?.title}
                  onChangeText={(t) => setEditingNote((p) => ({ ...p, title: t }))}
                />
                <TextInput
                  style={[styles.modalInput, styles.modalTextarea]}
                  placeholder="Not içeriği..."
                  placeholderTextColor="#4B5563"
                  value={editingNote?.content}
                  onChangeText={(t) => setEditingNote((p) => ({ ...p, content: t }))}
                  multiline
                  textAlignVertical="top"
                />
                {editingNote?.id && (
                  <TouchableOpacity style={styles.deleteRow} onPress={() => deleteNote(editingNote)}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    <Text style={styles.deleteRowText}>Notu Sil</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* KAYIT (SECRET) MODALI */}
      <Modal visible={secretModal} animationType="slide" transparent onRequestClose={() => setSecretModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%', justifyContent: 'flex-end' }}
          >
            <SafeAreaView style={styles.modalSheet} edges={['bottom']}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setSecretModal(false)}>
                  <Text style={styles.modalCancel}>Vazgeç</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>{editingSecret?.id ? 'Kaydı Düzenle' : 'Yeni Kayıt'}</Text>
                <TouchableOpacity onPress={saveSecret}>
                  <Text style={styles.modalSave}>Kaydet</Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
                <Text style={styles.fieldLabel}>Başlık *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Örn: Şirket E-posta"
                  placeholderTextColor="#4B5563"
                  value={editingSecret?.title}
                  onChangeText={(t) => setEditingSecret((p) => ({ ...p, title: t }))}
                />
                <Text style={styles.fieldLabel}>Kullanıcı adı / E-posta</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="kullanici@ornek.com"
                  placeholderTextColor="#4B5563"
                  value={editingSecret?.account}
                  onChangeText={(t) => setEditingSecret((p) => ({ ...p, account: t }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.fieldLabel}>Şifre / Gizli değer</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="••••••••"
                  placeholderTextColor="#4B5563"
                  value={editingSecret?.secret}
                  onChangeText={(t) => setEditingSecret((p) => ({ ...p, secret: t }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.fieldLabel}>Not</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalTextarea]}
                  placeholder="Ek bilgi..."
                  placeholderTextColor="#4B5563"
                  value={editingSecret?.note}
                  onChangeText={(t) => setEditingSecret((p) => ({ ...p, note: t }))}
                  multiline
                  textAlignVertical="top"
                />
                {editingSecret?.id && (
                  <TouchableOpacity style={styles.deleteRow} onPress={() => deleteSecret(editingSecret)}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    <Text style={styles.deleteRowText}>Kaydı Sil</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#F3F4F6' },
  settingsButton: { padding: 8 },
  segmentBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  segmentActive: { backgroundColor: '#00FF87', borderColor: '#00FF87' },
  segmentText: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  segmentTextActive: { color: '#0B0F19', fontWeight: '700' },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  uploadingText: { color: '#00FF87', fontSize: 12, fontWeight: '500' },
  listContent: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 4 },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: { color: '#F3F4F6', fontSize: 15, fontWeight: '700' },
  cardBody: { color: '#9CA3AF', fontSize: 13, marginTop: 4 },
  cardMeta: { color: '#4B5563', fontSize: 11, marginTop: 8 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#0B0F19',
    borderWidth: 1,
    borderColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: { flex: 1 },
  iconBtn: { padding: 6 },
  secretRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  secretValue: { flex: 1, color: '#D1D5DB', fontSize: 14, letterSpacing: 1 },
  empty: { alignItems: 'center', marginTop: 80, gap: 12 },
  emptyText: { color: '#4B5563', fontSize: 14 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#00FF87',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00FF87',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(3,7,18,0.85)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#0B0F19',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#1F2937',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#F3F4F6' },
  modalCancel: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
  modalSave: { color: '#00FF87', fontSize: 14, fontWeight: '700' },
  modalBody: { padding: 20, gap: 12 },
  fieldLabel: { color: '#9CA3AF', fontSize: 12, fontWeight: '600', marginTop: 4 },
  modalInput: {
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#1F2937',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F3F4F6',
    fontSize: 15,
  },
  modalTextarea: { minHeight: 120 },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  deleteRowText: { color: '#EF4444', fontSize: 14, fontWeight: '700' },
});
