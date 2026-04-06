import React from 'react';
import { ScrollView, Pressable, StyleSheet, Switch } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View, useThemeColor } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useSettingsStore, TabKey } from '@/store/useSettingsStore';

const PRESET_COLORS = [
  '#0084ff', // Zhihu Blue
  '#ff4d4f', // Red
  '#2ecc71', // Green
  '#f39c12', // Orange
  '#9b59b6', // Purple
  '#34495e', // Navy
];

const TAB_LABELS: Record<TabKey, string> = {
  following: '关注',
  recommend: '推荐',
  hot: '热榜',
  daily: '日报',
  publish: '发布',
  profile: '我的',
};

export default function AppearanceSettings() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { 
    fontSizeScale, 
    lineHeightScale, 
    primaryColor, 
    visibleTabs, 
    defaultTab,
    updateSettings,
    resetSettings 
  } = useSettingsStore();

  const tintColor = useThemeColor({}, 'primary');

  const toggleTab = (tab: TabKey) => {
    if (visibleTabs.includes(tab)) {
      // 核心：禁止隐藏“我的”页面，防止进入赛博灯泡困境
      if (tab === 'profile') return;
      if (visibleTabs.length > 1) {
        updateSettings({ visibleTabs: visibleTabs.filter(t => t !== tab) });
      }
    } else {
      updateSettings({ visibleTabs: [...visibleTabs, tab] });
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: '外观与定制', headerShadowVisible: false }} />
      
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 20 }}>
        
        {/* 1. 字体风格 */}
        <Section title="字体与排版">
          <SettingItem label="字体大小">
            <View style={styles.row}>
              <Pressable 
                onPress={() => updateSettings({ fontSizeScale: Math.max(0.8, fontSizeScale - 0.1) })}
                style={[styles.smallBtn, { backgroundColor: Colors[colorScheme].backgroundTertiary }]}
              >
                <Ionicons name="remove" size={20} color={Colors[colorScheme].text} />
              </Pressable>
              <Text style={styles.valueText}>{fontSizeScale.toFixed(1)}x</Text>
              <Pressable 
                onPress={() => updateSettings({ fontSizeScale: Math.min(1.5, fontSizeScale + 0.1) })}
                style={[styles.smallBtn, { backgroundColor: Colors[colorScheme].backgroundTertiary }]}
              >
                <Ionicons name="add" size={20} color={Colors[colorScheme].text} />
              </Pressable>
            </View>
          </SettingItem>

          <SettingItem label="行高比例">
            <View style={styles.row}>
              <Pressable 
                onPress={() => updateSettings({ lineHeightScale: Math.max(1.0, lineHeightScale - 0.1) })}
                style={[styles.smallBtn, { backgroundColor: Colors[colorScheme].backgroundTertiary }]}
              >
                <Ionicons name="remove" size={20} color={Colors[colorScheme].text} />
              </Pressable>
              <Text style={styles.valueText}>{lineHeightScale.toFixed(1)}x</Text>
              <Pressable 
                onPress={() => updateSettings({ lineHeightScale: Math.min(2.5, lineHeightScale + 0.1) })}
                style={[styles.smallBtn, { backgroundColor: Colors[colorScheme].backgroundTertiary }]}
              >
                <Ionicons name="add" size={20} color={Colors[colorScheme].text} />
              </Pressable>
            </View>
          </SettingItem>
        </Section>

        {/* 2. 主题颜色 */}
        <Section title="主题颜色">
          <View style={styles.colorGrid}>
            {PRESET_COLORS.map(color => (
              <Pressable 
                key={color}
                onPress={() => updateSettings({ primaryColor: color })}
                style={[
                  styles.colorCircle, 
                  { backgroundColor: color },
                  primaryColor === color && { borderColor: Colors[colorScheme].text, borderWidth: 3 }
                ]}
              />
            ))}
            <Pressable 
              onPress={() => updateSettings({ primaryColor: null })}
              style={[
                styles.colorCircle, 
                { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
                primaryColor === null && { borderColor: Colors[colorScheme].text, borderWidth: 3 }
              ]}
            >
              <Ionicons name="refresh" size={24} color="#666" />
            </Pressable>
          </View>
        </Section>

        {/* 3. 栏目管理 */}
        <Section title="栏目展示 (至少保留一个)">
          {(Object.keys(TAB_LABELS) as TabKey[]).map(tab => (
            <SettingItem key={tab} label={TAB_LABELS[tab]}>
              <Switch 
                value={visibleTabs.includes(tab)}
                onValueChange={() => toggleTab(tab)}
                trackColor={{ true: tintColor }}
                disabled={tab === 'profile'}
              />
            </SettingItem>
          ))}
        </Section>

        {/* 4. 默认落地页 */}
        <Section title="默认启动页">
          <View style={styles.tabGrid}>
            {visibleTabs.map(tab => (
              <Pressable 
                key={tab}
                onPress={() => updateSettings({ defaultTab: tab })}
                style={[
                  styles.tabChip,
                  { backgroundColor: Colors[colorScheme].backgroundTertiary },
                  defaultTab === tab && { backgroundColor: tintColor }
                ]}
              >
                <Text style={[styles.tabChipText, defaultTab === tab && { color: '#fff', fontWeight: 'bold' }]}>
                  {TAB_LABELS[tab]}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Pressable 
          onPress={resetSettings}
          style={styles.resetBtn}
        >
          <Text style={{ color: Colors[colorScheme].danger, fontWeight: 'bold' }}>恢复默认设置</Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} type="secondary">{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function SettingItem({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <View style={styles.settingItem}>
      <Text style={styles.settingLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, marginBottom: 10, marginLeft: 4, textTransform: 'uppercase' },
  sectionContent: { 
    borderRadius: 16, 
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(150,150,150,0.05)',
    marginBottom: 1,
  },
  settingLabel: { fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent' },
  smallBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  valueText: {
    width: 50,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: 'bold',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 12,
    backgroundColor: 'rgba(150,150,150,0.05)',
    borderRadius: 16,
  },
  colorCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  tabGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    padding: 12,
    backgroundColor: 'rgba(150,150,150,0.05)',
    borderRadius: 16,
  },
  tabChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tabChipText: { fontSize: 14 },
  resetBtn: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255,77,79,0.05)',
  },
});
