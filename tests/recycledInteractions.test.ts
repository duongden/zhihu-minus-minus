import { act, fireEvent, render } from '@testing-library/react-native';
import { createElement } from 'react';
import { followMember, voteContent } from '../api/zhihu';
import { voteContent as voteContentDirect } from '../api/zhihu/voters';
import { DownvoteButton } from '../components/DownvoteButton';
import { LikeButton } from '../components/LikeButton';
import { UserCard } from '../components/UserCard';
import { updateContentInteractionCaches } from '../utils/contentCache';

jest.mock('../api/zhihu', () => ({
  voteContent: jest.fn(),
  followMember: jest.fn(),
  unfollowMember: jest.fn(),
  getVoteSuccessMessage: () => '合成结果',
}));
jest.mock('../api/zhihu/voters', () => ({
  voteContent: jest.fn(),
  getVoteSuccessMessage: () => '合成结果',
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(async () => {}),
  }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../store/useAuthStore', () => ({
  useAuthStore: (selector: (state: { cookies: string }) => unknown) =>
    selector({ cookies: 'synthetic-session' }),
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  useAnimatedStyle: (callback: () => unknown) => callback(),
  useSharedValue: (value: number) => ({ value }),
  withSequence: (...values: number[]) => values.at(-1),
  withSpring: (value: number) => value,
  withTiming: (value: number) => value,
}));
jest.mock('../components/VoteTriangle', () => ({ VoteTriangle: () => null }));
jest.mock('../components/StableAvatar', () => ({ StableAvatar: () => null }));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/Themed', () => {
  const native = jest.requireActual('react-native');
  return { Text: native.Text, View: native.View, useThemeColor: () => '#00f' };
});
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: (props: import('react-native').PressableProps) =>
    jest
      .requireActual('react')
      .createElement(jest.requireActual('react-native').Pressable, {
        ...props,
        onPress: (event: import('react-native').GestureResponderEvent) => {
          void props.onPress?.(event);
        },
      }),
}));
jest.mock('../utils/contentCache', () => ({
  updateContentInteractionCaches: jest.fn(),
}));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test('an old upvote completion only updates its own cache after the cell is recycled', async () => {
  let finish: (result: Awaited<ReturnType<typeof voteContent>>) => void =
    () => {};
  jest.mocked(voteContent).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onVoteChange = jest.fn();
  const host = await render(
    createElement(LikeButton, {
      id: 'original',
      count: 10,
      voted: 0,
      onVoteChange,
    }),
  );
  await fireEvent.press(host.getByRole('button'));
  await host.rerender(
    createElement(LikeButton, {
      id: 'next',
      count: 10,
      voted: 0,
      onVoteChange,
    }),
  );
  expect(host.getByRole('button').props.accessibilityState).toMatchObject({
    busy: false,
    selected: false,
  });
  await act(() => finish({ voted: 1, voteCount: 11 }));
  expect(host.getByRole('button').props.accessibilityState).toMatchObject({
    selected: false,
  });
  expect(onVoteChange).not.toHaveBeenCalled();
  expect(updateContentInteractionCaches).toHaveBeenCalledWith(
    expect.anything(),
    {
      type: 'answers',
      id: 'original',
      voted: 1,
      voteCount: 11,
    },
  );
});

test('an old downvote completion cannot select the next recycled target', async () => {
  let finish: (result: Awaited<ReturnType<typeof voteContentDirect>>) => void =
    () => {};
  jest.mocked(voteContentDirect).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onVoteChange = jest.fn();
  const host = await render(
    createElement(DownvoteButton, {
      id: 'original',
      voted: 0,
      variant: 'ghost',
      onVoteChange,
    }),
  );
  await fireEvent.press(host.getByRole('button', { name: '反对' }));
  expect(voteContentDirect).toHaveBeenCalledWith('original', 'answers', 'down');
  await host.rerender(
    createElement(DownvoteButton, {
      id: 'next',
      voted: 0,
      variant: 'ghost',
      onVoteChange,
    }),
  );
  await act(() => finish({ voted: -1, voteCount: 9 }));
  expect(host.getByRole('button').props.accessibilityState).toMatchObject({
    busy: false,
    selected: false,
  });
  expect(onVoteChange).not.toHaveBeenCalled();
  expect(updateContentInteractionCaches).toHaveBeenCalledWith(
    expect.anything(),
    {
      type: 'answers',
      id: 'original',
      voted: -1,
      voteCount: 9,
    },
  );
  await fireEvent.press(host.getByRole('button', { name: '反对' }));
  expect(voteContentDirect).toHaveBeenLastCalledWith('next', 'answers', 'down');
  await act(() => finish({ voted: -1, voteCount: 7 }));
  expect(host.getByRole('button', { name: '取消反对' })).toBeSelected();
  expect(onVoteChange).toHaveBeenCalledWith(-1, 7);
  expect(onVoteChange).toHaveBeenCalledTimes(1);
  expect(updateContentInteractionCaches).toHaveBeenLastCalledWith(
    expect.anything(),
    {
      type: 'answers',
      id: 'next',
      voted: -1,
      voteCount: 7,
    },
  );
});

test('an old follow completion leaves the next user card unchanged', async () => {
  let finish: (result: Awaited<ReturnType<typeof followMember>>) => void =
    () => {};
  jest.mocked(followMember).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = {
    id: 'original',
    type: 'people',
    avatar_url: 'https://example.com/synthetic-avatar.png',
    name: '合成 A',
    is_following: false,
    follower_count: 10,
  };
  const next = { ...first, id: 'next', name: '合成 B' };
  const host = await render(createElement(UserCard, { user: first }));
  await fireEvent.press(host.getByRole('button'), {
    stopPropagation: jest.fn(),
  });
  await host.rerender(createElement(UserCard, { user: next }));
  await act(() => finish({ follower_count: 11 }));
  expect(host.getByText('10 关注者')).toBeTruthy();
  expect(host.getByRole('button').props.accessibilityState).toMatchObject({
    busy: false,
    selected: false,
  });
});
