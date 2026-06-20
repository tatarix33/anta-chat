// ANTA Chat - Cases (Kanban) Kart Düzenleme/Oluşturma Modalı
// Dosya Yolu: anta-chat/components/CaseEditModal.js

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export const COLOR_OPTIONS = [
  { name: 'Kırmızı', hex: '#EF4444' },
  { name: 'Mavi', hex: '#3B82F6' },
  { name: 'Yeşil', hex: '#22C55E' },
  { name: 'Sarı', hex: '#EAB308' },
  { name: 'Mor', hex: '#A855F7' },
  { name: 'Pembe', hex: '#EC4899' },
  { name: 'Gri', hex: '#6B7280' },
  { name: 'Turuncu', hex: '#F97316' },
];

export const USERS = ['Anıl', 'Tarık', 'Ortak'];

export const assigneeColor = (a) =>
  a === 'Anıl' ? '#6366F1' : a === 'Tarık' ? '#F97316' : '#10B981';

const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).substring(2);

export default function CaseEditModal({
  visible,
  onClose,
  caseItem,
  columns,
  labels,
  initialColumnId,
  username,
  onSave,
  onDelete,
  onAddLabel,
  onDeleteLabel,
}) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [columnId, setColumnId] = useState('');
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [assignee, setAssignee] = useState(undefined);
  const [imageUrl, setImageUrl] = useState('');
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');

  const [addingLabel, setAddingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(COLOR_OPTIONS[0].hex);

  useEffect(() => {
    if (!visible) return;
    if (caseItem) {
      setTitle(caseItem.title || '');
      setDescription(caseItem.description || '');
      setColumnId(caseItem.column_id);
      setSelectedLabels(caseItem.labels || []);
      setSubtasks(caseItem.subtasks || []);
      setAssignee(caseItem.assignee || undefined);
      setImageUrl(caseItem.image_url || '');
      setComments(caseItem.comments || []);
    } else {
      setTitle('');
      setDescription('');
      setColumnId(initialColumnId || columns[0]?.id || '');
      setSelectedLabels([]);
      setSubtasks([]);
      setAssignee(undefined);
      setImageUrl('');
      setComments([]);
    }
    setAddingLabel(false);
    setNewSubtask('');
    setNewComment('');
  }, [visible, caseItem, initialColumnId, columns]);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('Eksik Bilgi', 'Lütfen kart için bir başlık girin.');
      return;
    }
    const finalColumnId = columnId || columns[0]?.id;
    if (!finalColumnId) {
      Alert.alert('Eksik Bilgi', 'Lütfen bir liste seçin.');
      return;
    }
    const payload = {
      ...(caseItem?.id ? { id: caseItem.id } : {}),
      column_id: finalColumnId,
      title: title.trim(),
      description: description.trim(),
      labels: selectedLabels,
      subtasks,
      comments,
      assignee: assignee || null,
      image_url: imageUrl.trim() || null,
    };
    onSave(payload);
    onClose();
  };

  const addSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, { id: generateId(), text: newSubtask.trim(), completed: false }]);
    setNewSubtask('');
  };
  const toggleSubtask = (id) =>
    setSubtasks(subtasks.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s)));
  const removeSubtask = (id) => setSubtasks(subtasks.filter((s) => s.id !== id));

  const addComment = () => {
    if (!newComment.trim()) return;
    setComments([
      ...comments,
      { id: generateId(), text: newComment.trim(), author: username || 'Anonim', createdAt: Date.now() },
    ]);
    setNewComment('');
  };

  const toggleLabel = (id) =>
    setSelectedLabels(
      selectedLabels.includes(id)
        ? selectedLabels.filter((x) => x !== id)
        : [...selectedLabels, id]
    );

  const createLabel = () => {
    if (!newLabelName.trim()) return;
    onAddLabel(newLabelName.trim(), newLabelColor);
    setNewLabelName('');
    setAddingLabel(false);
  };

  const subtaskProgress =
    subtasks.length > 0
      ? Math.round((subtasks.filter((s) => s.completed).length / subtasks.length) * 100)
      : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        {/* Header — inset'i Modal içinde garantiye almak için paddingTop elle veriliyor.
            (RN Modal ayrı pencere açtığı için SafeAreaView top edge 0 dönebiliyor.) */}
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.cancel}>İptal</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{caseItem ? 'Kartı Düzenle' : 'Yeni Kart'}</Text>
          <TouchableOpacity onPress={handleSave} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.save}>Kaydet</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0}
        >
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Kapak resmi önizleme */}
            {!!imageUrl.trim() && (
              <View style={styles.coverWrap}>
                <Image source={{ uri: imageUrl.trim() }} style={styles.cover} resizeMode="cover" />
                <TouchableOpacity style={styles.coverRemove} onPress={() => setImageUrl('')}>
                  <Ionicons name="close" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            {/* Başlık */}
            <TextInput
              style={styles.titleInput}
              placeholder="Kart başlığı..."
              placeholderTextColor="#4B5563"
              value={title}
              onChangeText={setTitle}
            />

            {/* Liste seçimi */}
            <Text style={styles.label}>LİSTE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowGap}>
              {columns.map((c) => {
                const active = columnId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setColumnId(c.id)}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{c.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Açıklama */}
            <Text style={styles.label}>AÇIKLAMA</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="Daha detaylı bir açıklama ekleyin..."
              placeholderTextColor="#4B5563"
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
            />

            {/* Atanan kişi */}
            <Text style={styles.label}>KİŞİ ATA</Text>
            <View style={styles.rowWrap}>
              {USERS.map((u) => {
                const active = assignee === u;
                return (
                  <TouchableOpacity
                    key={u}
                    style={[styles.assigneePill, active && { borderColor: assigneeColor(u) }]}
                    onPress={() => setAssignee(active ? undefined : u)}
                  >
                    <View style={[styles.dot, { backgroundColor: assigneeColor(u) }]} />
                    <Text style={[styles.assigneeText, active && { color: '#F3F4F6' }]}>{u}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Etiketler */}
            <Text style={styles.label}>ETİKETLER</Text>
            <View style={styles.rowWrap}>
              {labels.map((l) => {
                const active = selectedLabels.includes(l.id);
                return (
                  <TouchableOpacity
                    key={l.id}
                    style={[
                      styles.labelChip,
                      { backgroundColor: active ? l.color : '#1F2937', borderColor: l.color },
                    ]}
                    onPress={() => toggleLabel(l.id)}
                    onLongPress={() =>
                      Alert.alert('Etiketi Sil', `"${l.name}" etiketi silinsin mi?`, [
                        { text: 'Vazgeç', style: 'cancel' },
                        { text: 'Sil', style: 'destructive', onPress: () => onDeleteLabel(l.id) },
                      ])
                    }
                  >
                    <Text style={[styles.labelChipText, { color: active ? '#fff' : '#9CA3AF' }]}>
                      {l.name}
                    </Text>
                    {active && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </TouchableOpacity>
                );
              })}
            </View>

            {!addingLabel ? (
              <TouchableOpacity style={styles.linkBtn} onPress={() => setAddingLabel(true)}>
                <Ionicons name="add" size={14} color="#00FF87" />
                <Text style={styles.linkBtnText}>Yeni Etiket Oluştur</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.newLabelBox}>
                <TextInput
                  style={styles.input}
                  placeholder="Etiket adı..."
                  placeholderTextColor="#4B5563"
                  value={newLabelName}
                  onChangeText={setNewLabelName}
                />
                <View style={[styles.rowWrap, { marginTop: 10 }]}>
                  {COLOR_OPTIONS.map((c) => (
                    <TouchableOpacity
                      key={c.hex}
                      style={[
                        styles.swatch,
                        { backgroundColor: c.hex },
                        newLabelColor === c.hex && styles.swatchActive,
                      ]}
                      onPress={() => setNewLabelColor(c.hex)}
                    />
                  ))}
                </View>
                <View style={[styles.rowGap, { marginTop: 10 }]}>
                  <TouchableOpacity style={styles.smallBtn} onPress={createLabel}>
                    <Text style={styles.smallBtnText}>Ekle</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtnGhost} onPress={() => setAddingLabel(false)}>
                    <Text style={styles.smallBtnGhostText}>İptal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Kapak resmi URL */}
            <Text style={styles.label}>KAPAK RESMİ (URL)</Text>
            <View style={styles.urlRow}>
              <Ionicons name="image-outline" size={16} color="#6B7280" />
              <TextInput
                style={styles.urlInput}
                placeholder="Resim URL yapıştır..."
                placeholderTextColor="#4B5563"
                value={imageUrl}
                onChangeText={setImageUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Alt Görevler */}
            <View style={styles.sectionHeader}>
              <Text style={styles.label}>ALT GÖREVLER</Text>
              {subtasks.length > 0 && <Text style={styles.progress}>%{subtaskProgress}</Text>}
            </View>
            {subtasks.map((st) => (
              <View key={st.id} style={styles.subtaskRow}>
                <TouchableOpacity style={styles.subtaskCheckArea} onPress={() => toggleSubtask(st.id)}>
                  <View style={[styles.checkbox, st.completed && styles.checkboxDone]}>
                    {st.completed && <Ionicons name="checkmark" size={12} color="#0B0F19" />}
                  </View>
                  <Text style={[styles.subtaskText, st.completed && styles.subtaskTextDone]}>
                    {st.text}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeSubtask(st.id)} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.addInline}>
              <TextInput
                style={[styles.input, styles.flex]}
                placeholder="Bir öğe ekle..."
                placeholderTextColor="#4B5563"
                value={newSubtask}
                onChangeText={setNewSubtask}
                onSubmitEditing={addSubtask}
                returnKeyType="done"
              />
              <TouchableOpacity style={styles.smallBtn} onPress={addSubtask}>
                <Text style={styles.smallBtnText}>Ekle</Text>
              </TouchableOpacity>
            </View>

            {/* Yorumlar */}
            <Text style={[styles.label, { marginTop: 20 }]}>YORUMLAR</Text>
            {comments.length === 0 && <Text style={styles.emptyComment}>Henüz yorum yok.</Text>}
            {comments.map((c) => (
              <View key={c.id} style={styles.commentRow}>
                <View style={[styles.avatar, { backgroundColor: assigneeColor(c.author) }]}>
                  <Text style={styles.avatarText}>{(c.author || '?').charAt(0)}</Text>
                </View>
                <View style={styles.commentBubble}>
                  <View style={styles.commentMeta}>
                    <Text style={styles.commentAuthor}>{c.author}</Text>
                    <Text style={styles.commentTime}>
                      {new Date(c.createdAt).toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Text style={styles.commentText}>{c.text}</Text>
                </View>
              </View>
            ))}
            <View style={styles.addInline}>
              <TextInput
                style={[styles.input, styles.flex]}
                placeholder="Yorum yaz..."
                placeholderTextColor="#4B5563"
                value={newComment}
                onChangeText={setNewComment}
                onSubmitEditing={addComment}
                returnKeyType="send"
              />
              <TouchableOpacity style={styles.smallBtn} onPress={addComment}>
                <Ionicons name="send" size={16} color="#0B0F19" />
              </TouchableOpacity>
            </View>

            {/* Sil */}
            {caseItem && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() =>
                  Alert.alert('Kartı Sil', 'Bu kart silinsin mi?', [
                    { text: 'Vazgeç', style: 'cancel' },
                    {
                      text: 'Sil',
                      style: 'destructive',
                      onPress: () => {
                        onDelete(caseItem.id);
                        onClose();
                      },
                    },
                  ])
                }
              >
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                <Text style={styles.deleteBtnText}>Kartı Sil</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#1F2937',
  },
  headerTitle: { color: '#F3F4F6', fontSize: 16, fontWeight: '700' },
  cancel: { color: '#EF4444', fontSize: 14, fontWeight: '600' },
  save: { color: '#00FF87', fontSize: 14, fontWeight: '700' },
  body: { padding: 20, paddingBottom: 60, gap: 8 },
  coverWrap: { borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  cover: { width: '100%', height: 160, backgroundColor: '#1F2937' },
  coverRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 16,
    padding: 6,
  },
  titleInput: {
    color: '#F3F4F6',
    fontSize: 20,
    fontWeight: '700',
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#1F2937',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  label: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#1F2937',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F3F4F6',
    fontSize: 15,
  },
  textarea: { minHeight: 100 },
  rowGap: { flexDirection: 'row', gap: 8 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  pillActive: { backgroundColor: '#00FF87', borderColor: '#00FF87' },
  pillText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  pillTextActive: { color: '#0B0F19', fontWeight: '700' },
  assigneePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#111827',
    borderWidth: 1.5,
    borderColor: '#1F2937',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  assigneeText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  labelChipText: { fontSize: 12, fontWeight: '700' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  linkBtnText: { color: '#00FF87', fontSize: 13, fontWeight: '600' },
  newLabelBox: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 12,
    marginTop: 8,
  },
  swatch: { width: 26, height: 26, borderRadius: 13 },
  swatchActive: { borderWidth: 3, borderColor: '#F3F4F6' },
  smallBtn: {
    backgroundColor: '#00FF87',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnText: { color: '#0B0F19', fontSize: 13, fontWeight: '700' },
  smallBtnGhost: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  smallBtnGhostText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#1F2937',
    paddingHorizontal: 14,
  },
  urlInput: { flex: 1, color: '#F3F4F6', fontSize: 14, paddingVertical: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progress: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: '#1F2937',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 12,
  },
  subtaskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  subtaskCheckArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: '#00FF87', borderColor: '#00FF87' },
  subtaskText: { flex: 1, color: '#D1D5DB', fontSize: 14 },
  subtaskTextDone: { color: '#6B7280', textDecorationLine: 'line-through' },
  iconBtn: { padding: 6 },
  addInline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  emptyComment: { color: '#4B5563', fontSize: 13, fontStyle: 'italic' },
  commentRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  commentBubble: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 10,
  },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  commentAuthor: { color: '#F3F4F6', fontSize: 12, fontWeight: '700' },
  commentTime: { color: '#6B7280', fontSize: 10 },
  commentText: { color: '#D1D5DB', fontSize: 14, lineHeight: 19 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  deleteBtnText: { color: '#EF4444', fontSize: 14, fontWeight: '700' },
});
