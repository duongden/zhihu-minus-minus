import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { ZhihuMemberActivity } from '../api/zhihu/member';
import UserStreamScreen from '../app/user/[id]/stream';

const mockRefresh = jest.fn();
const mockFetchNextPage = jest.fn();
const mockQuery = {
  activities: [] as ZhihuMemberActivity[],
  isLoading: false,
  isError: false,
  hasNextPage: true,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  isFetching: false,
  refreshing: false,
  refresh: mockRefresh,
  fetchNextPage: mockFetchNextPage,
  refetch: jest.fn(),
};

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    renderItem,
    keyExtractor,
    ...props
  }: {
    data: Array<{ key: string }>;
    renderItem: (info: { item: { key: string } }) => ReactNode;
    keyExtractor: (item: { key: string }) => string;
  }) => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    return React.createElement(
      View,
      { testID: 'published-stream-list', ...props },
      data.map((item) =>
        React.createElement(
          View,
          { key: keyExtractor(item) },
          renderItem({ item }),
        ),
      ),
    );
  },
}));
jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      id: 'member-id',
      url_token: 'member-token',
      name: '合成用户',
      type: 'people',
      avatar_url: '',
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'member-token', unreadCount: '3' }),
  useRouter: () => ({ back: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../api/zhihu', () => ({ getMemberWithFallback: jest.fn() }));
jest.mock('../hooks/useUserCreations', () => ({
  useUserCreations: () => mockQuery,
}));
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../components/StableAvatar', () => ({ StableAvatar: () => null }));
jest.mock('../components/QueryErrorView', () => ({
  QueryErrorView: () => null,
}));
jest.mock('../components/FeedCard', () => ({
  FeedCard: ({ item }: { item: { id: string } }) =>
    jest
      .requireActual('react')
      .createElement(jest.requireActual('react-native').Text, null, item.id),
}));
jest.mock('../components/Themed', () => {
  const native = jest.requireActual('react-native');
  return { Text: native.Text, View: native.View, useThemeColor: () => '#00f' };
});
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../store/useSettingsStore', () => ({
  useSettingsStore: Object.assign(() => ({}), {
    getState: () => ({
      primaryColor: null,
      readingBackground: 'default',
      textContrast: 'standard',
      surfaceStyle: 'layered',
    }),
  }),
}));

function activity(id: string): ZhihuMemberActivity {
  return { id: `event-${id}`, target: { id, type: 'answer' } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.activities = ['a', 'b', 'c'].map(activity);
  mockQuery.refreshing = false;
  mockQuery.isFetching = false;
  mockRefresh.mockResolvedValue(undefined);
  mockFetchNextPage.mockResolvedValue(undefined);
});

test('refresh removes the entry unread marker and prevents pagination until the refresh settles', async () => {
  let finish: () => void = () => {};
  mockRefresh.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const host = await render(<UserStreamScreen />);
  expect(host.getByText('已看完本次更新')).toBeTruthy();
  await fireEvent(host.getByTestId('published-stream-list'), 'refresh');
  await fireEvent(host.getByTestId('published-stream-list'), 'refresh');
  await fireEvent(host.getByTestId('published-stream-list'), 'endReached');
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(mockFetchNextPage).not.toHaveBeenCalled();
  expect(host.queryByText('已看完本次更新')).toBeNull();

  mockQuery.activities = ['new', 'a', 'b', 'c'].map(activity);
  await act(() => finish());
  await host.rerender(<UserStreamScreen />);
  expect(host.queryByText('已看完本次更新')).toBeNull();
  await fireEvent(host.getByTestId('published-stream-list'), 'endReached');
  expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  await host.unmount();
});

test('refreshing query state blocks pagination and a rejected refresh can be retried', async () => {
  const host = await render(<UserStreamScreen />);
  mockQuery.refreshing = true;
  await host.rerender(<UserStreamScreen />);
  await fireEvent(host.getByTestId('published-stream-list'), 'endReached');
  await fireEvent(host.getByTestId('published-stream-list'), 'refresh');
  expect(mockFetchNextPage).not.toHaveBeenCalled();
  expect(mockRefresh).not.toHaveBeenCalled();

  mockQuery.refreshing = false;
  mockRefresh.mockRejectedValueOnce(new Error('合成刷新失败'));
  await host.rerender(<UserStreamScreen />);
  await fireEvent(host.getByTestId('published-stream-list'), 'refresh');
  await act(async () => {});
  await fireEvent(host.getByTestId('published-stream-list'), 'refresh');
  expect(mockRefresh).toHaveBeenCalledTimes(2);
  expect(host.queryByText('已看完本次更新')).toBeNull();
  await host.unmount();
});
