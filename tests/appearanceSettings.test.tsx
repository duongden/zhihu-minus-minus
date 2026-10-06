import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import AppearanceSettings from '../app/settings/appearance';
import { colors } from '../constants/designTokens';
import { READING_BACKGROUND_OPTIONS } from '../constants/theme';
import { type AppSettings, useSettingsStore } from '../store/useSettingsStore';
import { useThemeStore } from '../store/useThemeStore';

let mockColorScheme: 'light' | 'dark' = 'light';
const mockGestureUpdates: Array<(event: { x: number }) => void> = [];

jest.mock(
  '@expo/vector-icons/Ionicons',
  () => jest.requireActual('react-native').View,
);
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: ReactNode }) => children,
  Gesture: {
    Pan: () => {
      const gesture = {
        activeOffsetX: () => gesture,
        failOffsetY: () => gesture,
        onBegin: () => gesture,
        onUpdate: (callback: (event: { x: number }) => void) => {
          mockGestureUpdates.push(callback);
          return gesture;
        },
        onEnd: () => gesture,
      };
      return gesture;
    },
  },
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  runOnJS: (callback: unknown) => callback,
  useSharedValue: (value: unknown) =>
    jest.requireActual('react').useRef({ value }).current,
  useAnimatedStyle: (factory: () => unknown) => factory(),
  withTiming: (value: unknown) => value,
}));
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../components/settings/NavigationInteractionSettings', () => ({
  NavigationInteractionSettings: () => null,
}));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => mockColorScheme,
}));
jest.mock('../utils/haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('../store/useThemeStore', () => ({
  useThemeStore: jest.requireActual('zustand').create(() => ({
    themeMode: 'system',
    setThemeMode: jest.fn(),
  })),
}));
jest.mock('../store/useSettingsStore', () => ({
  useSettingsStore: jest
    .requireActual('zustand')
    .create((set: (settings: Partial<AppSettings>) => void) => ({
      primaryColor: '#0084ff',
      readingBackground: 'default',
      textContrast: 'standard',
      surfaceStyle: 'layered',
      fontSizeScale: 1,
      lineHeightScale: 1.5,
      richContentRenderer: 'native-v2',
      answerReadingMode: 'detail',
      updateSettings: set,
    })),
}));

beforeEach(() => {
  mockColorScheme = 'light';
  mockGestureUpdates.length = 0;
  useSettingsStore.setState({
    primaryColor: colors.light.primary,
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
    fontSizeScale: 1,
    lineHeightScale: 1.5,
  });
  useThemeStore.setState({ themeMode: 'system' });
});

test('reset restores the static default after selecting a different primary', async () => {
  const host = await render(<AppearanceSettings />);
  await fireEvent.press(host.getByRole('radio', { name: '玫瑰红' }));
  expect(useSettingsStore.getState().primaryColor).toBe('#f43f5e');
  expect(host.getByRole('radio', { name: '玫瑰红' })).toBeChecked();

  await fireEvent.press(host.getByRole('button', { name: '恢复默认主题色' }));
  expect(useSettingsStore.getState().primaryColor).toBe(colors.light.primary);
  expect(host.getByRole('radio', { name: '知乎蓝' })).toBeChecked();
  expect(host.getByRole('radio', { name: '玫瑰红' })).not.toBeChecked();
});

test.each([
  'light',
  'dark',
] as const)('%s reading background options select the existing stored key', async (scheme) => {
  mockColorScheme = scheme;
  const host = await render(<AppearanceSettings />);
  for (const option of READING_BACKGROUND_OPTIONS) {
    const swatch = host.getByRole('radio', { name: option.label });
    await fireEvent.press(swatch);
    expect(useSettingsStore.getState().readingBackground).toBe(option.value);
    expect(swatch).toBeChecked();
  }
});

test('the custom color preview follows a slider before committing the preference', async () => {
  const host = await render(<AppearanceSettings />);
  await fireEvent(host.getByLabelText('显示自定义颜色'), 'valueChange', true);
  const initialPreview = host.getByTestId('primary-color-preview').props.style
    .backgroundColor;
  await act(() => mockGestureUpdates[0]({ x: 0.5 }));
  const nextPreview = host.getByTestId('primary-color-preview').props.style
    .backgroundColor;
  expect(nextPreview).not.toBe(initialPreview);
  expect(host.getByLabelText('自定义主题色').props.value).toBe(nextPreview);
  expect(useSettingsStore.getState().primaryColor).toBe(colors.light.primary);
});

test('selects the answer destination mode without changing the body renderer', async () => {
  const host = await render(<AppearanceSettings />);
  await fireEvent.press(host.getByText('预览卡片列表'));
  expect(useSettingsStore.getState().answerReadingMode).toBe('preview-list');
  expect(useSettingsStore.getState().richContentRenderer).toBe('native-v2');
  await fireEvent.press(host.getByText('回答详情'));
  expect(useSettingsStore.getState().answerReadingMode).toBe('detail');
});
