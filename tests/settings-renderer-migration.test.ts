import * as SecureStore from 'expo-secure-store';
import {
  type AppSettings,
  type RichContentRenderer,
  useSettingsStore,
} from '../store/useSettingsStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

async function migrate(
  value: unknown,
  version = 12,
): Promise<Record<string, unknown>> {
  const migration = useSettingsStore.persist.getOptions().migrate;
  if (!migration) throw new Error('Settings migration must be registered');
  const migrated = await migration(value, version);
  if (!migrated || typeof migrated !== 'object' || Array.isArray(migrated)) {
    throw new Error('Settings migration must return a settings object');
  }
  return migrated as Record<string, unknown>;
}

beforeEach(() => {
  useSettingsStore.getState().resetSettings();
  jest.clearAllMocks();
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
});

test('defaults to tiqian-super-mini with visual feedback enabled in settings version 16', () => {
  expect(useSettingsStore.getState().richContentRenderer).toBe('native-v2');
  expect(useSettingsStore.getState().enablePressFeedback).toBe(true);
  expect(useSettingsStore.persist.getOptions().version).toBe(16);
});

test.each([
  [{ useWebView: true }, 'webview'],
  [{ useWebView: false }, 'native-v2'],
  [{}, 'native-v2'],
] as const)('migrates the legacy renderer toggle %j to %s', async (legacy, renderer) => {
  const migrated = await migrate(legacy);
  expect(migrated.richContentRenderer).toBe(renderer);
  expect(migrated).not.toHaveProperty('useWebView');
});

test.each<RichContentRenderer>([
  'webview',
  'native-v2',
])('preserves an existing valid renderer %s over the legacy toggle', async (renderer) => {
  const migrated = await migrate({
    richContentRenderer: renderer,
    useWebView: renderer !== 'webview',
  });
  expect(migrated.richContentRenderer).toBe(renderer);
  expect(migrated).not.toHaveProperty('useWebView');
});

test('recovers invalid persisted renderer values using the legacy setting', async () => {
  expect(
    (await migrate({ richContentRenderer: 'invalid', useWebView: true }))
      .richContentRenderer,
  ).toBe('webview');
  expect(
    (await migrate({ richContentRenderer: null })).richContentRenderer,
  ).toBe('native-v2');
});

test('retains unrelated settings and the earlier settings migrations', async () => {
  const legacy = {
    useWebView: true,
    fontSizeScale: 1.2,
    lineHeightScale: 1.7,
    primaryColor: '#12AbCd',
    localCityName: '上海',
    visibleTabs: ['recommend', 'profile'],
    enablePrivateMessaging: true,
  };
  const migrated = await migrate(legacy, 1);
  expect(migrated).toMatchObject({
    fontSizeScale: 1.2,
    lineHeightScale: 1.7,
    primaryColor: '#12abcd',
    localCityName: '上海',
    visibleTabs: ['recommend', 'profile'],
    enablePrivateMessaging: true,
    richContentRenderer: 'webview',
    pressOpacity: 0.82,
    androidFeedbackType: 'ripple',
    enablePressFeedback: true,
    enableLocalFeedFilter: false,
    enableHapticFeedback: true,
    useNativeIOSBottomTabs: true,
    recommendRequestAdInterval: -10,
  });
  expect(legacy).toHaveProperty('useWebView', true);
  expect(legacy.primaryColor).toBe('#12AbCd');
});

test('hydrates legacy settings and writes back only the new renderer field', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(
    JSON.stringify({
      state: { useWebView: true, fontSizeScale: 1.3 },
      version: 12,
    }),
  );
  await useSettingsStore.persist.rehydrate();

  expect(useSettingsStore.getState().richContentRenderer).toBe('webview');
  expect(useSettingsStore.getState().fontSizeScale).toBe(1.3);
  const persistedJson = jest
    .mocked(SecureStore.setItemAsync)
    .mock.calls.at(-1)?.[1];
  expect(persistedJson).toBeDefined();
  if (!persistedJson) throw new Error('Migrated settings must be persisted');
  expect(JSON.parse(persistedJson)).toMatchObject({
    state: {
      richContentRenderer: 'webview',
      fontSizeScale: 1.3,
      enablePressFeedback: true,
    },
    version: 16,
  });
  expect(JSON.parse(persistedJson).state).not.toHaveProperty('useWebView');
});

test('adds visual feedback to v13 settings without changing the saved style or haptics', async () => {
  const legacy = {
    androidFeedbackType: 'scale-opacity',
    pressOpacity: 0.75,
    pressScale: 0.93,
    enableHapticFeedback: false,
  };
  expect(await migrate(legacy, 13)).toMatchObject({
    ...legacy,
    enablePressFeedback: true,
  });
  expect(legacy).not.toHaveProperty('enablePressFeedback');
});

test('persists disabled visual feedback and restores the saved style when reenabled', async () => {
  useSettingsStore.getState().updateSettings({
    enablePressFeedback: false,
    androidFeedbackType: 'scale-opacity',
    pressOpacity: 0.75,
    pressScale: 0.93,
  });
  const persistedJson = jest
    .mocked(SecureStore.setItemAsync)
    .mock.calls.at(-1)?.[1];
  if (!persistedJson) throw new Error('Feedback preference must be persisted');
  useSettingsStore.setState({ enablePressFeedback: true });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(persistedJson);
  await useSettingsStore.persist.rehydrate();
  expect(useSettingsStore.getState().enablePressFeedback).toBe(false);

  useSettingsStore.getState().updateSettings({ enablePressFeedback: true });
  expect(useSettingsStore.getState()).toMatchObject({
    enablePressFeedback: true,
    androidFeedbackType: 'scale-opacity',
    pressOpacity: 0.75,
    pressScale: 0.93,
  });
});

test('sanitizes invalid renderer updates and retains a valid renderer during other updates', () => {
  const { updateSettings } = useSettingsStore.getState();
  updateSettings({ richContentRenderer: 'native-v2' });
  updateSettings({ fontSizeScale: 1.4 });
  expect(useSettingsStore.getState().richContentRenderer).toBe('native-v2');
  updateSettings({
    richContentRenderer: 'invalid',
  } as unknown as Partial<AppSettings>);
  expect(useSettingsStore.getState().richContentRenderer).toBe('native-v2');
  expect(useSettingsStore.getState().fontSizeScale).toBe(1.4);
});

test('migrates removed RNRH preferences without changing explicit WebView preferences', async () => {
  expect(
    (await migrate({ richContentRenderer: 'rnrh' }, 14)).richContentRenderer,
  ).toBe('native-v2');
  expect(
    (await migrate({ richContentRenderer: 'webview' }, 14)).richContentRenderer,
  ).toBe('webview');
});

test('adds the answer destination mode on upgrade while preserving explicit choices', async () => {
  expect(await migrate({ richContentRenderer: 'webview' }, 15)).toMatchObject({
    richContentRenderer: 'webview',
    answerReadingMode: 'detail',
  });
  expect(
    await migrate({ answerReadingMode: 'preview-list' }, 15),
  ).toMatchObject({ answerReadingMode: 'preview-list' });
  useSettingsStore
    .getState()
    .updateSettings({ answerReadingMode: 'preview-list' });
  expect(useSettingsStore.getState().answerReadingMode).toBe('preview-list');
  useSettingsStore.getState().updateSettings({
    answerReadingMode: 'invalid',
  } as unknown as Partial<AppSettings>);
  expect(useSettingsStore.getState().answerReadingMode).toBe('detail');
});
