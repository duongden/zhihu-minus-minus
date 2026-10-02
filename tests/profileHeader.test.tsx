import { act, fireEvent, render } from '@testing-library/react-native';
import type { ZhihuMember } from '../api/zhihu';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { resolveThemeColors } from '../constants/theme';
import { useSettingsStore } from '../store/useSettingsStore';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: jest.requireActual('react-native').View,
}));
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
  useColorScheme: () => 'light',
}));

const member: ZhihuMember = {
  id: 'profile-header-member',
  name: '测试作者',
  url_token: 'profile-header-member',
  avatar_url: '',
  type: 'people',
  following_count: 12,
  follower_count: 24500,
  mutual_followees_count: 3,
};

function props(user = member) {
  return {
    user,
    isMe: false,
    followLoading: false,
    topInset: 88,
    onFollow: jest.fn(),
    onFollowers: jest.fn(),
    onFollowing: jest.fn(),
    onMutual: jest.fn(),
  };
}

beforeEach(() => {
  useSettingsStore.setState({
    primaryColor: null,
    fontSizeScale: 1,
    lineHeightScale: 1.5,
  });
});

test('profile actions retain their targets and a pending follow cannot be pressed', async () => {
  const callbacks = props();
  const host = await render(<ProfileHeader {...callbacks} />);
  await fireEvent.press(host.getByRole('button', { name: '12 关注' }));
  await fireEvent.press(host.getByRole('button', { name: '24500 关注者' }));
  await fireEvent.press(host.getByRole('button', { name: '3 位共同关注' }));
  expect(callbacks.onFollowing).toHaveBeenCalledTimes(1);
  expect(callbacks.onFollowers).toHaveBeenCalledTimes(1);
  expect(callbacks.onMutual).toHaveBeenCalledTimes(1);

  await host.rerender(<ProfileHeader {...callbacks} followLoading />);
  await fireEvent.press(host.getByRole('button', { name: '关注测试作者' }));
  expect(callbacks.onFollow).not.toHaveBeenCalled();
  await host.rerender(<ProfileHeader {...callbacks} isMe />);
  expect(host.queryByRole('button', { name: '关注测试作者' })).toBeNull();
  expect(host.queryByRole('button', { name: '3 位共同关注' })).toBeNull();
});

test('a long biography can be read in full without expanding the next member', async () => {
  const description = '这是一段用于检查个人主页简介展开行为的脱敏介绍。'.repeat(
    8,
  );
  const callbacks = props({ ...member, description });
  const host = await render(<ProfileHeader {...callbacks} />);
  expect(host.getByText(description).props.numberOfLines).toBe(3);
  await fireEvent.press(host.getByRole('button', { name: '展开简介' }));
  expect(host.getByText(description).props.numberOfLines).toBeUndefined();
  expect(host.getByRole('button', { name: '收起简介' })).toBeTruthy();

  await host.rerender(
    <ProfileHeader
      {...callbacks}
      user={{ ...callbacks.user, id: 'second-member' }}
    />,
  );
  expect(host.getByText(description).props.numberOfLines).toBe(3);
  expect(host.getByRole('button', { name: '展开简介' })).toBeTruthy();
});

test('custom primary colors and large type update the open profile', async () => {
  const host = await render(<ProfileHeader {...props()} />);
  await act(() => {
    useSettingsStore.setState({ primaryColor: '#ffffff', fontSizeScale: 1.6 });
  });
  const palette = resolveThemeColors('light', {
    primaryColor: '#ffffff',
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
  });
  expect(host.getByRole('button', { name: '关注测试作者' })).toHaveStyle({
    backgroundColor: palette.primaryTransparent,
  });
  expect(host.getByText('关注', { exact: true })).toHaveStyle({
    color: palette.link,
  });
  expect(host.getByText('测试作者')).toHaveStyle({
    fontSize: 24 * 1.6,
    lineHeight: 30 * 1.6,
  });
});
