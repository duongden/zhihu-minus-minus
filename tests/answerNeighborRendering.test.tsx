import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import { type AnswerDetail, getAnswer } from '../api/zhihu';
import { getAllContentCollectionStatus } from '../api/zhihu/collection';
import { AnswerDetailView } from '../components/AnswerDetailView';

interface ReadingOptions {
  enabled: boolean;
  contentKey: string;
  ready: boolean;
}

interface MeasurementOptions {
  enabled: boolean;
  ready: boolean;
  onContentSizeChange: (width: number, height: number) => void;
}

interface Settings {
  richContentRenderer: string;
  fontSizeScale: number;
  lineHeightScale: number;
}

interface Collections {
  setCollectedStatus: (id: string, collected: boolean) => void;
  collectedStatusMap: Record<string, boolean>;
}

const mockReadingProgress = jest.fn((_options: ReadingOptions) => ({
  beginContentMeasurement: jest.fn(),
  onContentSizeChange: jest.fn(),
  onLayout: jest.fn(),
  onScroll: jest.fn(),
  commitProgress: jest.fn(),
  restoredOffset: null,
  scrollToTop: jest.fn(),
  dismissRestoreNotice: jest.fn(),
}));
const mockReadingMeasurement = jest.fn(
  (options: MeasurementOptions) => options.onContentSizeChange,
);
const mockBodyMount = jest.fn();
const mockBodyUnmount = jest.fn();
let mockLayoutReady: () => void;

jest.mock('../api/zhihu', () => ({
  getAnswer: jest.fn(),
  deleteAnswer: jest.fn(),
}));
jest.mock('../api/zhihu/collection', () => ({
  getAllContentCollectionStatus: jest.fn(),
}));
jest.mock('../api/zhihu/member', () => ({
  followMember: jest.fn(),
  unfollowMember: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-blur', () => ({
  BlurView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    ThemedIcon: () => null,
    useThemeColor: () => '#1364cc',
  };
});
jest.mock('../components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('../components/DetailNavigationHeader', () => ({
  useDetailNavigationHeight: () => 44,
}));
jest.mock('../components/DownvoteButton', () => ({
  DownvoteButton: () => null,
}));
jest.mock('../components/FollowButton', () => ({ FollowButton: () => null }));
jest.mock('../components/LikeButton', () => ({ LikeButton: () => null }));
jest.mock('../components/MoreActionsButton', () => ({
  MoreActionsButton: () => null,
}));
jest.mock('../components/QueryErrorView', () => ({
  QueryErrorView: () => null,
}));
jest.mock('../components/ReadingProgressNotice', () => ({
  ReadingProgressNotice: () => null,
}));
jest.mock('../components/ReadingScrollIndicator', () => ({
  ReadingScrollIndicator: () => null,
}));
jest.mock('../components/ShareMenu', () => ({ ShareMenu: () => null }));
jest.mock('../components/StableAvatar', () => ({ StableAvatar: () => null }));
jest.mock('../components/VoterListModal', () => ({
  VoterListModal: () => null,
}));
jest.mock('../hooks/useOptimisticToggle', () => ({
  useOptimisticToggle: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('../hooks/useReadingProgress', () => ({
  useReadingProgress: (options: ReadingOptions) => mockReadingProgress(options),
}));
jest.mock('../hooks/useReadingContentMeasurement', () => ({
  useReadingContentMeasurement: (options: MeasurementOptions) =>
    mockReadingMeasurement(options),
}));
jest.mock('../store/useSettingsStore', () => ({
  useSettingsStore: Object.assign(
    (selector: (state: Settings) => unknown) =>
      selector({
        richContentRenderer: 'native-v2',
        fontSizeScale: 1,
        lineHeightScale: 1,
      }),
    {
      getState: () => ({
        primaryColor: null,
        readingBackground: 'default',
        textContrast: 'standard',
        surfaceStyle: 'layered',
      }),
    },
  ),
}));
jest.mock('../store/useCollectionStore', () => ({
  useCollectionStore: (selector: (state: Collections) => unknown) =>
    selector({ setCollectedStatus: jest.fn(), collectedStatusMap: {} }),
}));
jest.mock('../features/rich-content', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    RICH_CONTENT_STALE_TIME: 300_000,
    isRichTextNativeAvailable: () => true,
    ZhihuContent: ({
      content,
      onLayoutReady,
    }: {
      content: string;
      onLayoutReady: () => void;
    }) => {
      mockLayoutReady = onLayoutReady;
      react.useEffect(() => {
        mockBodyMount();
        return () => mockBodyUnmount();
      }, []);
      return react.createElement(
        native.Text,
        { testID: 'answer-body' },
        content,
      );
    },
  };
});
jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View: native.View, ScrollView: native.ScrollView },
    SharedTransition: { duration: () => ({}) },
    useSharedValue: <T,>(value: T) => react.useRef({ value }).current,
    useAnimatedScrollHandler: () => jest.fn(),
    runOnJS: <T,>(callback: T) => callback,
  };
});

const answer: AnswerDetail = {
  id: '84',
  question: { id: '7', title: '合成问题', type: 'question' },
  author: {
    id: 'synthetic-author',
    name: '合成作者',
    avatar_url: '',
    type: 'people',
  },
  content: '<p>相邻回答的合成正文</p>',
  excerpt: '相邻回答的合成正文',
  created_time: 0,
  voteup_count: 0,
  comment_count: 0,
};

const clients: QueryClient[] = [];

async function renderAnswer({
  cached = true,
  isFocused = false,
  isPreloading = true,
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(queryClient);
  if (cached) queryClient.setQueryData(['answer-detail', answer.id], answer);
  const page = (focused: boolean, preloading: boolean) => (
    <QueryClientProvider client={queryClient}>
      <AnswerDetailView
        id={String(answer.id)}
        isFocused={focused}
        isPreloading={preloading}
      />
    </QueryClientProvider>
  );
  const host = await render(page(isFocused, isPreloading));
  return { ...host, queryClient, page };
}

function expectInactiveReading() {
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ contentKey: 'answer:84', enabled: false }),
  );
  expect(mockReadingMeasurement).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAnswer).mockResolvedValue(answer);
  jest
    .mocked(getAllContentCollectionStatus)
    .mockImplementation(() => new Promise(() => {}));
});

afterEach(() => {
  for (const client of clients) client.clear();
  clients.length = 0;
});

test('mounts a cached neighboring body before focus without starting detail, collection, or reading work', async () => {
  const host = await renderAnswer();

  expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content);
  expect(mockBodyMount).toHaveBeenCalledTimes(1);
  expect(getAnswer).not.toHaveBeenCalled();
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  expectInactiveReading();
});

test('keeps an uncached neighbor blank and mounts its body when prefetch populates the disabled query', async () => {
  const host = await renderAnswer({ cached: false });

  expect(host.queryByTestId('answer-body')).toBeNull();
  expect(mockBodyMount).not.toHaveBeenCalled();
  expect(getAnswer).not.toHaveBeenCalled();

  await act(() => {
    host.queryClient.setQueryData(['answer-detail', answer.id], answer);
  });
  await waitFor(() =>
    expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content),
  );

  expect(mockBodyMount).toHaveBeenCalledTimes(1);
  expect(getAnswer).not.toHaveBeenCalled();
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  expectInactiveReading();
});

test('leaves an unvisited page outside the neighboring window blank even when it has cached data', async () => {
  const host = await renderAnswer({ isPreloading: false });

  expect(host.queryByTestId('answer-body')).toBeNull();
  expect(mockBodyMount).not.toHaveBeenCalled();
  expect(getAnswer).not.toHaveBeenCalled();
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  expectInactiveReading();
});

test('unmounts an unvisited preloaded body when it leaves the neighboring window', async () => {
  const host = await renderAnswer();
  expect(host.getByTestId('answer-body')).toBeTruthy();

  await host.rerender(host.page(false, false));

  expect(host.queryByTestId('answer-body')).toBeNull();
  expect(mockBodyUnmount).toHaveBeenCalledTimes(1);
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  expectInactiveReading();
});

test('retains a visited body when focus and neighboring preload end while disabling reading work', async () => {
  const host = await renderAnswer();
  await host.rerender(host.page(true, true));
  await waitFor(() =>
    expect(getAllContentCollectionStatus).toHaveBeenCalledTimes(1),
  );
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: true }),
  );
  expect(mockReadingMeasurement).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: true }),
  );

  await host.rerender(host.page(false, false));

  expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content);
  expect(mockBodyMount).toHaveBeenCalledTimes(1);
  expect(mockBodyUnmount).not.toHaveBeenCalled();
  expect(getAnswer).not.toHaveBeenCalled();
  expectInactiveReading();
});

test('preserves native layout readiness when a preloaded body becomes focused', async () => {
  const host = await renderAnswer();
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false, ready: false }),
  );
  await act(() => mockLayoutReady());
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false, ready: true }),
  );

  await host.rerender(host.page(true, true));

  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: true, ready: true }),
  );
  expect(mockBodyMount).toHaveBeenCalledTimes(1);
  expect(mockBodyUnmount).not.toHaveBeenCalled();
});

test('requires a fresh native layout after an unvisited body leaves and reenters the preload window', async () => {
  const host = await renderAnswer();
  const oldLayoutReady = mockLayoutReady;
  await act(() => oldLayoutReady());
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ ready: true }),
  );

  await host.rerender(host.page(false, false));
  expect(host.queryByTestId('answer-body')).toBeNull();
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ ready: false }),
  );
  await host.rerender(host.page(false, true));
  expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content);
  expect(mockBodyMount).toHaveBeenCalledTimes(2);
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ ready: false }),
  );

  const newLayoutReady = mockLayoutReady;
  await act(() => oldLayoutReady());
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ ready: false }),
  );
  await act(() => newLayoutReady());
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false, ready: true }),
  );
  await act(() => oldLayoutReady());
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false, ready: true }),
  );
  await host.rerender(host.page(true, true));
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: true, ready: true }),
  );
});
