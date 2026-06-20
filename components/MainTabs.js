// ANTA Chat - Ana Sekme Konteyneri (Sohbet / Kasa / Görevler)
// Dosya Yolu: anta-chat/components/MainTabs.js

import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import ChatScreen from './ChatScreen';
import VaultScreen from './VaultScreen';
import CasesScreen from './CasesScreen';

const TABS = [
  { key: 'chat', label: 'Sohbet', icon: 'chatbubbles' },
  { key: 'vault', label: 'Kasa', icon: 'lock-closed' },
  { key: 'cases', label: 'Cases', icon: 'grid' },
];

export default function MainTabs({ username, onOpenSettings }) {
  const [activeTab, setActiveTab] = useState('chat');
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={styles.screenArea}>
        {activeTab === 'chat' && (
          <ChatScreen username={username} onOpenSettings={onOpenSettings} />
        )}
        {activeTab === 'vault' && (
          <VaultScreen username={username} onOpenSettings={onOpenSettings} />
        )}
        {activeTab === 'cases' && (
          <CasesScreen username={username} onOpenSettings={onOpenSettings} />
        )}
      </View>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={active ? tab.icon : `${tab.icon}-outline`}
                size={24}
                color={active ? '#00FF87' : '#6B7280'}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  screenArea: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderColor: '#1E293B',
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#00FF87',
  },
});
