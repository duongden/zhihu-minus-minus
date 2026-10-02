import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import {
  getMemberActivities,
  getMemberRelations,
  getMemberWithFallback,
  searchContent,
} from '../api/zhihu';
import {
  getRecentMemberActivities,
  type ZhihuMember,
} from '../api/zhihu/member';
import UserDetailScreen from '../app/user/[id]/index';
import type { ProfileTabListProps } from '../components/profile/ProfileTabList';

interface MockPagerProps extends PropsWithChildren {
  initialPage: number;
  onPageSelected: (event: { nativeEvent: { position: number } }) => void;
}

let mockPagerProps: MockPagerProps;
const mockSetPage = jest.fn();
const mockPush = jest.fn();
const mockScrollToOffset = jest.fn();
const mockPagerMount = jest.fn();
const mockPagerUnmount = jest.fn();
const mockListMount = jest.fn();
const mockListUnmount = jest.fn();
const mockListProps = new Map<string, ProfileTabListProps>();
const member: ZhihuMember = {
  id: 'member-hash-id',
  url_token: 'member-readable-token',
  name: '合成作者',
  type: 'people',
  avatar_url: '',
};
let mockRoute: { id: string; tab?: string };
let mockAuthState: { cookies: string; me: ZhihuMember };

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockRoute,
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock('../api/zhihu', () => ({
  getMe: jest.fn(),
  getMemberWithFallback: jest.fn(),
  getMemberActivities: jest.fn(),
  getMemberRelations: jest.fn(),
  searchContent: jest.fn(),
  followMember: jest.fn(),
  unfollowMember: jest.fn(),
  getContentVoteCount: () => 0,
  getContentVoteState: () => 0,
  MEMBER_ANSWERS_INCLUDE: 'synthetic-answer-fields',
}));
jest.mock('../api/zhihu/member', () => ({
  getRecentMemberActivities: jest.fn(),
}));
jest.mock('../api/zhihu/history', () => ({ addReadHistory: jest.fn() }));
jest.mock('../store/useAuthStore', () => ({
  useAuthStore: () => mockAuthState,
}));
jest.mock('../store/useSettingsStore', () => ({
  useSettingsStore: jest.requireActual('zustand').create(() => ({
    primaryColor: null,
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
    fontSizeScale: 1,
    lineHeightScale: 1.5,
    enableBrowseHistory: false,
  })),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/Themed', () => {
  const native = jest.requireActual('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#1364cc',
  };
});
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../components/StableAvatar', () => ({ StableAvatar: () => null }));
jest.mock('../components/profile/ProfileCover', () => ({
  ProfileToolbarBackground: () => null,
}));
jest.mock('../components/profile/ProfileHeader', () => ({
  ProfileHeader: ({ isMe }: { isMe: boolean }) =>
    jest
      .requireActual('react')
      .createElement(
        jest.requireActual('react-native').Text,
        { testID: 'profile-owner' },
        isMe ? '自己的主页' : '其他人的主页',
      ),
}));
jest.mock('../components/FeedCard', () => ({
  FeedCard: ({ item }: { item: { title: string } }) =>
    jest
      .requireActual('react')
      .createElement(jest.requireActual('react-native').Text, null, item.title),
}));
jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: {
      View: jest.requireActual('react-native').View,
      createAnimatedComponent: (component: unknown) => component,
    },
    useSharedValue: (value: unknown) => react.useRef({ value }).current,
    useDerivedValue: (factory: () => unknown) => ({ value: factory() }),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useAnimatedReaction: () => undefined,
    useEvent: (callback: unknown) => callback,
    interpolate: () => 0,
    runOnJS: (callback: unknown) => callback,
  };
});
jest.mock('react-native-pager-view', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: react.forwardRef((props: MockPagerProps, ref) => {
      mockPagerProps = props;
      react.useImperativeHandle(ref, () => ({ setPage: mockSetPage }));
      react.useEffect(() => {
        mockPagerMount();
        return () => mockPagerUnmount();
      }, []);
      return react.createElement(
        jest.requireActual('react-native').View,
        { testID: 'native-profile-pager' },
        props.children,
      );
    }),
  };
});
jest.mock('../components/profile/ProfileTabList', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    ProfileTabList: react.forwardRef((props: ProfileTabListProps, ref) => {
      mockListProps.set(props.label, props);
      react.useImperativeHandle(ref, () => ({
        scrollToOffset: mockScrollToOffset,
      }));
      react.useEffect(() => {
        mockListMount(props.label);
        return () => mockListUnmount(props.label);
      }, [props.label]);
      return react.createElement(
        jest.requireActual('react-native').View,
        { testID: `profile-list-${props.label}` },
        props.listHeader,
        props.query.data.map((item) =>
          react.createElement(
            react.Fragment,
            { key: props.keyExtractor(item) },
            props.renderItem(item),
          ),
        ),
      );
    }),
  };
});

let client: QueryClient;
const emptyPage = {
  data: [],
  paging: { is_end: true, is_start: true, next: '', previous: '', totals: 0 },
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockListProps.clear();
  mockRoute = { id: 'member-readable-token' };
  mockAuthState = { cookies: 'synthetic-session', me: member };
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
  client.setQueryData(['user-detail', mockRoute.id], member);
  jest.mocked(getMemberWithFallback).mockResolvedValue(member);
  jest.mocked(getMemberActivities).mockResolvedValue(emptyPage);
  jest.mocked(getMemberRelations).mockResolvedValue(emptyPage);
  jest.mocked(searchContent).mockResolvedValue(emptyPage);
  jest.mocked(getRecentMemberActivities).mockResolvedValue({
    ...emptyPage,
    data: [
      {
        id: 'creation-event',
        target: {
          id: 'creation-answer',
          type: 'answer',
          question: { id: 'question-id', title: '最近更新的创作' },
        },
      },
    ],
  });
});
afterEach(async () => {
  await act(async () => {
    await jest.runOnlyPendingTimersAsync();
  });
  client.clear();
  jest.useRealTimers();
});

const screen = () => (
  <QueryClientProvider client={client}>
    <UserDetailScreen />
  </QueryClientProvider>
);

async function flushQueries(duration = 1) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(duration);
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });
}

test.each([
  true,
  false,
])('the creation tab sits between activity and answers and loads for own profile: %s', async (ownProfile) => {
  mockRoute.tab = 'answers';
  mockAuthState.me = ownProfile
    ? member
    : { ...member, id: 'other-member', url_token: 'other-token' };
  client.setQueryData(['me'], mockAuthState.me);
  const host = await render(screen());
  expect(
    host.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel),
  ).toEqual(['动态', '创作', '回答', '文章', '提问', '想法']);
  expect(host.getByTestId('profile-owner')).toHaveTextContent(
    ownProfile ? '自己的主页' : '其他人的主页',
  );
  expect(mockPagerProps.initialPage).toBe(2);
  expect(getRecentMemberActivities).not.toHaveBeenCalled();

  await fireEvent.press(host.getByRole('tab', { name: '创作' }));
  expect(mockSetPage).toHaveBeenLastCalledWith(1);
  await act(() =>
    mockPagerProps.onPageSelected({ nativeEvent: { position: 1 } }),
  );
  await flushQueries();
  expect(getRecentMemberActivities).toHaveBeenCalledWith(
    'member-hash-id',
    { offset: expect.any(Number), pageNum: 1 },
    expect.objectContaining({ aborted: false }),
  );
  expect(host.getByRole('tab', { name: '创作' })).toBeSelected();
  expect(mockListProps.get('创作')?.active).toBe(true);
  expect(host.getByText('最近更新的创作')).toBeTruthy();
  await host.unmount();
});

test.each([
  undefined,
  'invalid-tab',
  'creations',
])('a missing, invalid or creation tab opens creations immediately: %s', async (tab) => {
  mockRoute.tab = tab;
  client.setQueryData(['me'], member);
  const host = await render(screen());
  await flushQueries();
  expect(mockPagerProps.initialPage).toBe(1);
  expect(host.getByRole('tab', { name: '创作' })).toBeSelected();
  expect(getRecentMemberActivities).toHaveBeenCalledTimes(1);
  expect(getMemberRelations).not.toHaveBeenCalled();
  await host.unmount();
});

test('a failed profile refresh retains the cached header and native pager', async () => {
  mockRoute.tab = 'answers';
  client.setQueryData(['me'], member);
  const host = await render(screen());
  await flushQueries();
  const pager = host.getByTestId('native-profile-pager');
  jest.mocked(getMemberWithFallback).mockRejectedValue(new Error('offline'));
  await act(async () => {
    await mockListProps.get('回答')?.query.refresh();
  });
  await flushQueries();
  expect(client.getQueryState(['user-detail', mockRoute.id])?.status).toBe(
    'error',
  );
  expect(host.getByTestId('native-profile-pager')).toBe(pager);
  expect(host.getByTestId('profile-owner')).toBeTruthy();
  expect(mockPagerUnmount).not.toHaveBeenCalled();
  expect(mockListUnmount).not.toHaveBeenCalled();
  await host.unmount();
});

test('search opens a separate route without altering the active tab or list offsets', async () => {
  mockRoute.tab = 'answers';
  client.setQueryData(['me'], member);
  const host = await render(screen());
  const pager = host.getByTestId('native-profile-pager');
  expect(host.queryByPlaceholderText('搜索 合成作者 的创作...')).toBeNull();
  await fireEvent.press(host.getByLabelText('搜索此用户的创作'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/user/[id]/search',
    params: { id: 'member-readable-token' },
  });
  expect(host.getByTestId('native-profile-pager')).toBe(pager);
  expect(host.getByRole('tab', { name: '回答' })).toBeSelected();
  expect(mockListProps.get('回答')?.active).toBe(true);
  expect(mockScrollToOffset).not.toHaveBeenCalled();
  expect(mockSetPage).not.toHaveBeenCalled();
  expect(mockPagerUnmount).not.toHaveBeenCalled();
  expect(mockListUnmount).not.toHaveBeenCalled();
  expect(searchContent).not.toHaveBeenCalled();
  await host.unmount();
});

test('switching member routes resets visited tabs and the native pager', async () => {
  mockRoute.tab = 'answers';
  client.setQueryData(['me'], member);
  const host = await render(screen());
  await fireEvent.press(host.getByRole('tab', { name: '创作' }));
  await act(() =>
    mockPagerProps.onPageSelected({ nativeEvent: { position: 1 } }),
  );
  await flushQueries();

  const secondMember = {
    ...member,
    id: 'second-member-id',
    url_token: 'second-member-token',
    name: '另一位作者',
  };
  mockRoute = { id: secondMember.url_token };
  client.setQueryData(['user-detail', mockRoute.id], secondMember);
  await host.rerender(screen());
  await flushQueries(350);

  expect(host.queryByTestId('profile-list-搜索结果')).toBeNull();
  expect(mockPagerProps.initialPage).toBe(1);
  expect(host.getByRole('tab', { name: '创作' })).toBeSelected();
  expect(mockListProps.get('创作')?.active).toBe(true);
  expect(mockListProps.get('回答')?.active).toBe(false);
  expect(mockPagerMount).toHaveBeenCalledTimes(2);
  expect(mockPagerUnmount).toHaveBeenCalledTimes(1);
  expect(searchContent).not.toHaveBeenCalled();
  expect(getRecentMemberActivities).toHaveBeenCalledTimes(2);
  expect(getRecentMemberActivities).toHaveBeenLastCalledWith(
    'second-member-id',
    { offset: expect.any(Number), pageNum: 1 },
    expect.objectContaining({ aborted: false }),
  );
  expect(getMemberRelations).toHaveBeenCalledTimes(1);
  await host.unmount();
});

test('creation cards of different types retain distinct list keys when their IDs coincide', async () => {
  mockRoute.tab = 'creations';
  client.setQueryData(['me'], member);
  jest.mocked(getRecentMemberActivities).mockResolvedValue({
    ...emptyPage,
    data: [
      {
        id: 'answer-event',
        target: {
          id: 'shared-content-id',
          type: 'answer',
          question: { title: '相同标识的回答' },
        },
      },
      {
        id: 'article-event',
        target: {
          id: 'shared-content-id',
          type: 'article',
          title: '相同标识的文章',
        },
      },
    ],
  });
  const host = await render(screen());
  await flushQueries();
  expect(host.getByText('相同标识的回答')).toBeTruthy();
  expect(host.getByText('相同标识的文章')).toBeTruthy();
  const list = mockListProps.get('创作');
  const keys = list?.query.data.map(list.keyExtractor);
  expect(keys).toHaveLength(2);
  expect(new Set(keys).size).toBe(2);
  await host.unmount();
});
