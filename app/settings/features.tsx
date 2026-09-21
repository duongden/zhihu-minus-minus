import { Stack } from 'expo-router';
import { View as RNView, ScrollView, StyleSheet, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Section, SettingItem } from '@/components/SettingItem';
import { Text, useThemeColor } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { useSettingsStore } from '@/store/useSettingsStore';

export default function FeatureSettings() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const canvasColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'primary');
  const {
    enableBrowseHistory,
    enablePrivateMessaging,
    updateSettings,
    useWebView,
  } = useSettingsStore();

  return (
    <RNView style={[styles.container, { backgroundColor: canvasColor }]}>
      <Stack.Screen
        options={{ title: '功能开关', headerShadowVisible: false }}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <RNView style={styles.intro}>
          <Text style={styles.introTitle}>按需要开启附加能力</Text>
          <Text type="secondary" style={styles.introBody}>
            这些功能可能改变内容渲染、增加网络请求，或在设备上保存额外记录；关闭后不会影响基础阅读。
          </Text>
        </RNView>

        <Section title="阅读与记录" colorScheme={colorScheme}>
          <SettingItem
            label="记录浏览历史"
            icon="time-outline"
            colorScheme={colorScheme}
          >
            <Switch
              value={enableBrowseHistory}
              onValueChange={(value) =>
                updateSettings({ enableBrowseHistory: value })
              }
              trackColor={{ true: tintColor }}
            />
          </SettingItem>
          <SettingItem
            label="WebView 渲染正文（不建议）"
            icon="globe-outline"
            colorScheme={colorScheme}
          >
            <Switch
              value={useWebView}
              onValueChange={(value) => updateSettings({ useWebView: value })}
              trackColor={{ true: tintColor }}
            />
          </SettingItem>
        </Section>

        <Section title="沟通" colorScheme={colorScheme}>
          <SettingItem
            label="启用私信功能（不建议）"
            icon="chatbubbles-outline"
            colorScheme={colorScheme}
          >
            <Switch
              value={enablePrivateMessaging}
              onValueChange={(value) =>
                updateSettings({ enablePrivateMessaging: value })
              }
              trackColor={{ true: tintColor }}
            />
          </SettingItem>
        </Section>
      </ScrollView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  intro: { paddingHorizontal: 4, marginBottom: 24 },
  introTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  introBody: { fontSize: 14, lineHeight: 22 },
});
