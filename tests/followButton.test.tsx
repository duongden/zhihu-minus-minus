import { act, fireEvent, render } from '@testing-library/react-native';
import type { GestureResponderEvent } from 'react-native';
import { FollowButton } from '../components/FollowButton';
import { resolveThemeColors } from '../constants/theme';
import { useSettingsStore } from '../store/useSettingsStore';

let mockColorScheme: 'light' | 'dark' = 'light';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../store/useSettingsStore', () => ({
  useSettingsStore: jest.requireActual('zustand').create(() => ({
    primaryColor: null,
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
    fontSizeScale: 1,
    lineHeightScale: 1.5,
  })),
}));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => mockColorScheme,
}));

function currentPalette() {
  const state = useSettingsStore.getState();
  return resolveThemeColors(mockColorScheme, {
    primaryColor: state.primaryColor,
    readingBackground: state.readingBackground,
    textContrast: state.textContrast,
    surfaceStyle: state.surfaceStyle,
  });
}

beforeEach(() => {
  mockColorScheme = 'light';
  useSettingsStore.setState({
    primaryColor: null,
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
    fontSizeScale: 1,
    lineHeightScale: 1.5,
  });
});

test.each([
  false,
  true,
])('following=%s uses the corresponding shared palette and accessible state', async (following) => {
  const host = await render(
    <FollowButton following={following} onPress={jest.fn()} />,
  );
  const palette = currentPalette();
  const button = host.getByRole('button', {
    name: following ? '取消关注' : '关注',
  });
  expect(button).toHaveStyle({
    backgroundColor: following ? 'transparent' : palette.primaryTransparent,
    borderColor: following ? palette.border : 'transparent',
  });
  expect(host.getByText(following ? '已关注' : '关注')).toHaveStyle({
    color: following ? palette.textSecondary : palette.link,
  });
  if (following) expect(button).toBeSelected();
  else expect(button).not.toBeSelected();
  expect(button).toBeEnabled();
});

test('an already mounted button responds to custom colors, reading background and dark mode', async () => {
  const onPress = jest.fn();
  const host = await render(
    <FollowButton following={false} onPress={onPress} />,
  );
  await act(() => {
    useSettingsStore.setState({
      primaryColor: '#ffffff',
      readingBackground: 'warm',
    });
  });
  let palette = currentPalette();
  expect(host.getByRole('button', { name: '关注' })).toHaveStyle({
    backgroundColor: palette.primaryTransparent,
  });
  expect(host.getByText('关注')).toHaveStyle({ color: palette.link });
  expect(palette.link).not.toBe('#ffffff');

  mockColorScheme = 'dark';
  await host.rerender(<FollowButton following onPress={onPress} />);
  palette = currentPalette();
  expect(host.getByRole('button', { name: '取消关注' })).toHaveStyle({
    backgroundColor: 'transparent',
    borderColor: palette.border,
  });
  expect(host.getByText('已关注')).toHaveStyle({
    color: palette.textSecondary,
  });
});

test.each([
  false,
  true,
])('loading disables following=%s without losing its status label', async (following) => {
  const onPress = jest.fn();
  const host = await render(
    <FollowButton following={following} loading onPress={onPress} />,
  );
  const button = host.getByRole('button', {
    name: following ? '取消关注' : '关注',
  });
  expect(button).toBeDisabled();
  expect(button).toBeBusy();
  expect(host.getByText(following ? '已关注' : '关注')).toBeTruthy();
  await fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();

  await host.rerender(
    <FollowButton following={following} disabled onPress={onPress} />,
  );
  expect(button).toBeDisabled();
  expect(button).not.toBeBusy();
  await fireEvent.press(button);
  expect(onPress).not.toHaveBeenCalled();
});

test('custom labels and the original press event survive for nested card actions', async () => {
  const onPress = jest.fn((event: GestureResponderEvent) => {
    event.stopPropagation();
  });
  const host = await render(
    <FollowButton
      following={false}
      label="关注问题"
      accessibilityLabel="关注这个问题"
      onPress={onPress}
    />,
  );
  const event = { stopPropagation: jest.fn() };
  expect(host.getByText('关注问题')).toBeTruthy();
  await fireEvent.press(
    host.getByRole('button', { name: '关注这个问题' }),
    event,
  );
  expect(onPress).toHaveBeenCalledTimes(1);
  expect(onPress).toHaveBeenCalledWith(expect.objectContaining(event));
  expect(event.stopPropagation).toHaveBeenCalledTimes(1);
});
