// ANTA Chat - Cases (Kanban Pano) Ekranı
// Web 'cases-by-anta-ai-studio' özelliklerinin mobile + Supabase uyarlaması.
// Dosya Yolu: anta-chat/components/CasesScreen.js

import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  Modal,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import CaseEditModal, { assigneeColor } from './CaseEditModal';

const DEFAULT_COLUMNS = [
  { id: 'col-1', title: 'Yapılacaklar', position: 0 },
  { id: 'col-2', title: 'Sürüyor', position: 1 },
  { id: 'col-3', title: 'Tamamlandı', position: 2 },
];

const DEFAULT_LABELS = [
  { name: 'Acil', color: '#EF4444' },
  { name: 'Tasarım', color: '#3B82F6' },
  { name: 'Yazılım', color: '#A855F7' },
  { name: 'Pazarlama', color: '#EAB308' },
  { name: 'Düşük Öncelik', color: '#22C55E' },
];

const FIXED_COLUMNS = ['col-1', 'col-2', 'col-3'];

const generateId = () =>
  Date.now().toString(36) + Math.random().toString(36).substring(2);

export default function CasesScreen({ username, onOpenSettings }) {
  const [columns, setColumns] = useState([]);
  const [labels, setLabels] = useState([]);
  const [cases, setCases] = useState([]);
  const [activeColumn, setActiveColumn] = useState(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingCase, setEditingCase] = useState(null);

  const [newColumnVisible, setNewColumnVisible] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');

  // ---- Veri çekme + ilk kurulum (seeding) ----
  const fetchColumns = useCallback(async () => {
    const { data } = await supabase.from('cases_columns').select('*').order('position');
    if (!data) return [];
    if (data.length === 0) {
      await supabase.from('cases_columns').insert(DEFAULT_COLUMNS);
      setColumns(DEFAULT_COLUMNS);
      return DEFAULT_COLUMNS;
    }
    setColumns(data);
    return data;
  }, []);

  const fetchLabels = useCallback(async () => {
    const { data } = await supabase.from('cases_labels').select('*').order('created_at');
    if (!data) return;
    if (data.length === 0) {
      await supabase.from('cases_labels').insert(DEFAULT_LABELS);
      const { data: seeded } = await supabase.from('cases_labels').select('*').order('created_at');
      setLabels(seeded || []);
    } else {
      setLabels(data);
    }
  }, []);

  const fetchCases = useCallback(async () => {
    const { data } = await supabase
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setCases(data);
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const cols = await fetchColumns();
      await Promise.all([fetchLabels(), fetchCases()]);
      setActiveColumn((prev) => {
        if (prev && cols.some((c) => c.id === prev)) return prev;
        return cols[0]?.id || null;
      });
    } catch (err) {
      console.error('Cases yüklenemedi:', err);
    }
  }, [fetchColumns, fetchLabels, fetchCases]);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel('public:cases')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, fetchCases)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases_columns' }, fetchColumns)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases_labels' }, fetchLabels)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAll, fetchCases, fetchColumns, fetchLabels]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  // ---- Kart işlemleri ----
  const saveCase = async (payload) => {
    try {
      if (payload.id) {
        const { id, ...rest } = payload;
        await supabase.from('cases').update({ ...rest, updated_at: new Date() }).eq('id', id);
      } else {
        await supabase.from('cases').insert([payload]);
      }
      fetchCases();
    } catch (err) {
      console.error('Kart kaydedilemedi:', err);
      Alert.alert('Hata', `Kart kaydedilemedi.\n${err.message || ''}`);
    }
  };

  const deleteCase = async (id) => {
    await supabase.from('cases').delete().eq('id', id);
    fetchCases();
  };

  const moveCase = async (id, targetColumnId) => {
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, column_id: targetColumnId } : c)));
    await supabase.from('cases').update({ column_id: targetColumnId, updated_at: new Date() }).eq('id', id);
  };

  // ---- Etiket işlemleri ----
  const addLabel = async (name, color) => {
    await supabase.from('cases_labels').insert([{ name, color }]);
    fetchLabels();
  };
  const deleteLabel = async (id) => {
    await supabase.from('cases_labels').delete().eq('id', id);
    fetchLabels();
  };

  // ---- Sütun işlemleri ----
  const addColumn = async () => {
    const title = newColumnTitle.trim();
    if (!title) return;
    const col = { id: generateId(), title, position: columns.length };
    setNewColumnTitle('');
    setNewColumnVisible(false);
    await supabase.from('cases_columns').insert([col]);
    fetchColumns();
    setActiveColumn(col.id);
  };

  const deleteColumn = (col) => {
    if (FIXED_COLUMNS.includes(col.id)) return;
    Alert.alert('Listeyi Sil', `"${col.title}" listesi silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('cases_columns').delete().eq('id', col.id);
          setActiveColumn(columns[0]?.id || null);
          fetchColumns();
        },
      },
    ]);
  };

  const openNewCase = () => {
    setEditingCase(null);
    setModalVisible(true);
  };
  const openCase = (item) => {
    setEditingCase(item);
    setModalVisible(true);
  };

  // ---- Türetilmiş veri ----
  const labelById = (id) => labels.find((l) => l.id === id);
  const q = search.trim().toLowerCase();
  const visibleCases = cases.filter(
    (c) =>
      c.column_id === activeColumn &&
      (!q ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q))
  );
  const countFor = (colId) => cases.filter((c) => c.column_id === colId).length;

  // ---- Kart render ----
  const renderCase = ({ item }) => {
    const itemLabels = (item.labels || []).map(labelById).filter(Boolean);
    const total = (item.subtasks || []).length;
    const done = (item.subtasks || []).filter((s) => s.completed).length;
    const allDone = total > 0 && done === total;

    return (
      <TouchableOpacity style={styles.card} onPress={() => openCase(item)} activeOpacity={0.85}>
        {!!item.image_url && (
          <Image source={{ uri: item.image_url }} style={styles.cardCover} resizeMode="cover" />
        )}
        <View style={styles.cardBody}>
          {itemLabels.length > 0 && (
            <View style={styles.labelRow}>
              {itemLabels.map((l) => (
                <View key={l.id} style={[styles.labelChip, { backgroundColor: l.color }]}>
                  <Text style={styles.labelChipText}>{l.name}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.cardTitle}>{item.title}</Text>

          <View style={styles.indicatorRow}>
            {!!item.description && <Ionicons name="reorder-three-outline" size={16} color="#6B7280" />}
            {total > 0 && (
              <View style={[styles.subBadge, allDone && styles.subBadgeDone]}>
                <Ionicons name="checkbox-outline" size={12} color={allDone ? '#22C55E' : '#9CA3AF'} />
                <Text style={[styles.subBadgeText, allDone && { color: '#22C55E' }]}>
                  {done}/{total}
                </Text>
              </View>
            )}
            {(item.comments || []).length > 0 && (
              <View style={styles.subBadge}>
                <Ionicons name="chatbubble-outline" size={12} color="#9CA3AF" />
                <Text style={styles.subBadgeText}>{item.comments.length}</Text>
              </View>
            )}
            {!!item.assignee && (
              <View style={[styles.assignee, { backgroundColor: assigneeColor(item.assignee) }]}>
                <Text style={styles.assigneeText}>{item.assignee}</Text>
              </View>
            )}
          </View>

          {/* Hızlı taşıma butonları */}
          {item.column_id === 'col-1' && (
            <View style={styles.quickRow}>
              <TouchableOpacity style={[styles.quickBtn, styles.quickBlue]} onPress={() => moveCase(item.id, 'col-2')}>
                <Ionicons name="play" size={11} color="#60A5FA" />
                <Text style={[styles.quickText, { color: '#60A5FA' }]}>Başla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickBtn, styles.quickGreen]} onPress={() => moveCase(item.id, 'col-3')}>
                <Ionicons name="checkmark-circle" size={13} color="#22C55E" />
                <Text style={[styles.quickText, { color: '#22C55E' }]}>Bitir</Text>
              </TouchableOpacity>
            </View>
          )}
          {item.column_id === 'col-2' && (
            <View style={styles.quickRow}>
              <TouchableOpacity style={[styles.quickBtn, styles.quickGreen, { flex: 1 }]} onPress={() => moveCase(item.id, 'col-3')}>
                <Ionicons name="checkmark-circle" size={13} color="#22C55E" />
                <Text style={[styles.quickText, { color: '#22C55E' }]}>Tamamla</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <Ionicons name="grid" size={18} color="#0B0F19" />
          </View>
          <View>
            <Text style={styles.brandTitle}>Cases</Text>
            <Text style={styles.brandSub}>ANTA AI STUDIO</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.settingsButton} onPress={onOpenSettings}>
          <Ionicons name="settings-sharp" size={22} color="#00FF87" />
        </TouchableOpacity>
      </View>

      {/* Arama */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Kartlarda ara..."
          placeholderTextColor="#4B5563"
          value={search}
          onChangeText={setSearch}
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* Sütun pill'leri */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colBar}>
          {columns.map((c) => {
            const active = activeColumn === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.colPill, active && styles.colPillActive]}
                onPress={() => setActiveColumn(c.id)}
                onLongPress={() => deleteColumn(c)}
              >
                <Text style={[styles.colPillText, active && styles.colPillTextActive]}>{c.title}</Text>
                <View style={[styles.colCount, active && styles.colCountActive]}>
                  <Text style={[styles.colCountText, active && { color: '#0B0F19' }]}>{countFor(c.id)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.addColPill} onPress={() => setNewColumnVisible(true)}>
            <Ionicons name="add" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Kart listesi */}
      <FlatList
        data={visibleCases}
        keyExtractor={(item) => item.id}
        renderItem={renderCase}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00FF87" />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="documents-outline" size={56} color="#1E293B" />
            <Text style={styles.emptyText}>Bu listede kart yok</Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={openNewCase} activeOpacity={0.85}>
        <Ionicons name="add" size={30} color="#0B0F19" />
      </TouchableOpacity>

      {/* Kart düzenleme modalı */}
      <CaseEditModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        caseItem={editingCase}
        columns={columns}
        labels={labels}
        initialColumnId={activeColumn}
        username={username}
        onSave={saveCase}
        onDelete={deleteCase}
        onAddLabel={addLabel}
        onDeleteLabel={deleteLabel}
      />

      {/* Yeni sütun modalı */}
      <Modal visible={newColumnVisible} transparent animationType="fade" onRequestClose={() => setNewColumnVisible(false)}>
        <View style={styles.miniOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%', alignItems: 'center' }}
          >
            <View style={styles.miniBox}>
              <Text style={styles.miniTitle}>Yeni Liste</Text>
              <TextInput
                style={styles.miniInput}
                placeholder="Liste adı..."
                placeholderTextColor="#4B5563"
                value={newColumnTitle}
                onChangeText={setNewColumnTitle}
                autoFocus
              />
              <View style={styles.miniRow}>
                <TouchableOpacity style={styles.miniGhost} onPress={() => setNewColumnVisible(false)}>
                  <Text style={styles.miniGhostText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.miniBtn} onPress={addColumn}>
                  <Text style={styles.miniBtnText}>Ekle</Text>
                </TouchableOpacity>
              </View>
            </View>
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
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#00FF87',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: { color: '#F3F4F6', fontSize: 18, fontWeight: '800', lineHeight: 20 },
  brandSub: { color: '#6B7280', fontSize: 8, fontWeight: '700', letterSpacing: 2 },
  settingsButton: { padding: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#111827',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1F2937',
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, color: '#F3F4F6', fontSize: 14, paddingVertical: 10 },
  colBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  colPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  colPillActive: { backgroundColor: '#00FF87', borderColor: '#00FF87' },
  colPillText: { color: '#9CA3AF', fontSize: 13, fontWeight: '600' },
  colPillTextActive: { color: '#0B0F19', fontWeight: '700' },
  colCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: '#1F2937',
    alignItems: 'center',
  },
  colCountActive: { backgroundColor: 'rgba(11,15,25,0.2)' },
  colCountText: { color: '#9CA3AF', fontSize: 11, fontWeight: '700' },
  addColPill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1F2937',
    borderStyle: 'dashed',
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 4 },
  card: {
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardCover: { width: '100%', height: 130, backgroundColor: '#1F2937' },
  cardBody: { padding: 12, gap: 8 },
  labelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  labelChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  labelChipText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  cardTitle: { color: '#F3F4F6', fontSize: 15, fontWeight: '700', lineHeight: 20 },
  indicatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  subBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#1F2937',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  subBadgeDone: { backgroundColor: 'rgba(34,197,94,0.12)' },
  subBadgeText: { color: '#9CA3AF', fontSize: 10, fontWeight: '600' },
  assignee: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  assigneeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderColor: '#1F2937' },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: 6,
  },
  quickBlue: { backgroundColor: 'rgba(59,130,246,0.12)' },
  quickGreen: { backgroundColor: 'rgba(34,197,94,0.12)' },
  quickText: { fontSize: 11, fontWeight: '700' },
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
  miniOverlay: {
    flex: 1,
    backgroundColor: 'rgba(3,7,18,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  miniBox: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 20,
  },
  miniTitle: { color: '#F3F4F6', fontSize: 16, fontWeight: '700', marginBottom: 14 },
  miniInput: {
    backgroundColor: '#0B0F19',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#1F2937',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F3F4F6',
    fontSize: 15,
  },
  miniRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  miniGhost: { paddingHorizontal: 16, paddingVertical: 10 },
  miniGhostText: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
  miniBtn: { backgroundColor: '#00FF87', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  miniBtnText: { color: '#0B0F19', fontSize: 14, fontWeight: '700' },
});
