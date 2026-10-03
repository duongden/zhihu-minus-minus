import { act, fireEvent, render } from '@testing-library/react-native';
import type React from 'react';
import { type FeedItem, voteContent } from '../api/zhihu';
import { CreationCard } from '../components/CreationCard';
import { FeedCard } from '../components/FeedCard';
import { updateContentInteractionCaches } from '../utils/contentCache';

interface MenuProps {
  visible: boolean;
  type: string;
  data: {
    id: string | number;
    questionId?: string | number;
    isCollected?: boolean;
  };
}

let mockShareMenuProps: MenuProps;
const mockUseContentActions = jest.fn();
const mockCopy = jest.fn();
const mockPush = jest.fn();

jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  const react = jest.requireActual('react');
  const View = react.forwardRef((props: object, ref: React.Ref<unknown>) => {
    react.useImperativeHandle(ref, () => ({
      measureInWindow: (callback: (...frame: number[]) => void) =>
        callback(0, 0, 320, 160),
    }));
    return react.createElement(native.View, props);
  });
  return new Proxy(native, {
    get: (target, key) => (key === 'View' ? View : target[key]),
  });
});
jest.mock('../api/zhihu', () => ({
  voteContent: jest.fn(),
  getVoteSuccessMessage: () => '合成成功',
  getContentVoteCount: () => 0,
  getContentVoteState: () => 0,
}));
jest.mock('../api/client', () => ({ hasAuthenticationCookie: () => true }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  FontAwesome6: () =>
    jest
      .requireActual('react')
      .createElement(
        jest.requireActual('react-native').Text,
        null,
        '独立收藏按钮',
      ),
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: jest.requireActual('react-native').View,
    Image: jest.requireActual('react-native').Image,
  },
  SharedTransition: { duration: () => ({}) },
}));
jest.mock('../store/useAuthStore', () => ({
  useAuthStore: () => ({ cookies: 'synthetic-session' }),
}));
jest.mock('../store/useCollectionStore', () => ({
  useCollectionStore: (selector: (state: object) => unknown) =>
    selector({ collectedStatusMap: {}, collectedCountOffsetMap: {} }),
}));
jest.mock('../hooks/useContentActions', () => ({
  useContentActions: (options: unknown) => {
    mockUseContentActions(options);
    return {
      actions: [
        {
          key: 'copy-link',
          label: '复制链接',
          icon: 'link-outline',
          onPress: mockCopy,
        },
      ],
    };
  },
}));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/Themed', () => {
  const native = jest.requireActual('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#123456',
  };
});
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../components/FeedCardPreview', () => ({
  FeedCardPreview: () => null,
}));
jest.mock('../components/FeedExcerpt', () => ({ FeedExcerpt: () => null }));
jest.mock('../components/ShareMenu', () => ({
  ShareMenu: (props: MenuProps) => {
    mockShareMenuProps = props;
    return props.visible
      ? jest
          .requireActual('react')
          .createElement(
            jest.requireActual('react-native').Text,
            null,
            `更多:${props.data.id}`,
          )
      : null;
  },
}));
jest.mock('../features/rich-content', () => ({ ZhihuContent: () => null }));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: jest.requireActual('react-native').View,
}));
jest.mock('../components/LikeButton', () => ({
  LikeButton: ({ count, voted }: { count: number; voted: number }) =>
    jest
      .requireActual('react')
      .createElement(
        jest.requireActual('react-native').Text,
        null,
        `vote:${voted}/${count}`,
      ),
}));
jest.mock('../components/CustomContextMenu', () => ({
  CustomContextMenu: ({
    options,
  }: {
    options: Array<{ key: string; title: string; onPress: () => void }>;
  }) =>
    options.map((option) =>
      jest.requireActual('react').createElement(
        jest.requireActual('react-native').Pressable,
        {
          key: option.key,
          onPress: () => {
            void option.onPress();
          },
        },
        jest
          .requireActual('react')
          .createElement(
            jest.requireActual('react-native').Text,
            null,
            option.title,
          ),
      ),
    ),
}));
jest.mock('../utils/contentCache', () => ({
  seedRichContentFromFeedItem: jest.fn(),
  updateContentInteractionCaches: jest.fn(),
}));
jest.mock('../utils/haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

const baseItem: FeedItem = {
  id: 'original',
  type: 'answers',
  title: '合成原卡片',
  excerpt: '',
  author: { id: 'author', name: '合成作者', avatar: '' },
  image: null,
  voteCount: 10,
  commentCount: 0,
  voted: 0,
};

test('a context-menu vote remains attached to its original item after recycling and ignores duplicate taps', async () => {
  let finish: (result: Awaited<ReturnType<typeof voteContent>>) => void =
    () => {};
  jest.mocked(voteContent).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const item: FeedItem = {
    id: 'original',
    type: 'answers',
    title: '合成原卡片',
    excerpt: '',
    author: { id: 'author', name: '合成作者', avatar: '' },
    image: null,
    voteCount: 10,
    commentCount: 0,
    voted: 0,
  };
  const host = await render(<FeedCard item={item} />);
  await fireEvent(host.getByText('合成原卡片'), 'longPress');
  await fireEvent.press(host.getByText('赞同'));
  await fireEvent.press(host.getByText('赞同'));
  expect(voteContent).toHaveBeenCalledTimes(1);
  await host.rerender(
    <FeedCard item={{ ...item, id: 'next', title: '合成新卡片' }} />,
  );
  expect(host.queryByText('赞同')).toBeNull();
  await act(() => finish({ voted: 1, voteCount: 11 }));
  expect(host.getByText('vote:0/10')).toBeTruthy();
  expect(updateContentInteractionCaches).toHaveBeenCalledWith(
    expect.anything(),
    { type: 'answers', id: 'original', voted: 1, voteCount: 11 },
  );
});

test.each([
  'answers',
  'articles',
  'pins',
  'questions',
  'videos',
] as const)('a %s feed card exposes one more entry without a separate collection control', async (type) => {
  const host = await render(
    <FeedCard item={{ ...baseItem, type, questionId: 'question' }} />,
  );
  expect(host.queryByText('独立收藏按钮')).toBeNull();
  expect(mockUseContentActions).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false }),
  );
  const stopPropagation = jest.fn();
  await fireEvent.press(host.getByRole('button', { name: '更多操作' }), {
    stopPropagation,
  });
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(mockPush).not.toHaveBeenCalled();
  expect(host.getByText('更多:original')).toBeTruthy();
  expect(mockShareMenuProps.data).toMatchObject({
    id: 'original',
    questionId: 'question',
    isCollected: undefined,
  });
  await host.rerender(
    <FeedCard item={{ ...baseItem, type, id: 'next', title: '合成新卡片' }} />,
  );
  expect(host.queryByText('更多:original')).toBeNull();
  expect(host.queryByText('更多:next')).toBeNull();
});

test('feed previews use the shared action builder with the current content identity', async () => {
  const host = await render(
    <FeedCard item={{ ...baseItem, questionId: 'question' }} />,
  );
  await fireEvent(host.getByText('合成原卡片'), 'longPress');
  expect(mockUseContentActions).toHaveBeenLastCalledWith({
    type: 'answer',
    enabled: true,
    data: expect.objectContaining({
      id: 'original',
      questionId: 'question',
      isCollected: undefined,
    }),
  });
  await fireEvent.press(host.getByText('复制链接'));
  expect(mockCopy).toHaveBeenCalledTimes(1);
});

test('creation cards reset their more menu and local expansion after identity recycling', async () => {
  const item = {
    id: 'original',
    title: '合成原创作',
    content: '合成正文'.repeat(40),
    question: { id: 'question', title: '合成问题' },
  };
  const host = await render(<CreationCard item={item} type="answer" />);
  expect(host.queryByText('独立收藏按钮')).toBeNull();
  await fireEvent.press(host.getByText('展开全文'));
  expect(host.getByText('收起回答')).toBeTruthy();
  const stopPropagation = jest.fn();
  await fireEvent.press(host.getByRole('button', { name: '更多操作' }), {
    stopPropagation,
  });
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(mockPush).not.toHaveBeenCalled();
  expect(host.getByText('更多:original')).toBeTruthy();
  expect(mockShareMenuProps.data).toMatchObject({
    questionId: 'question',
    isCollected: undefined,
  });
  await host.rerender(
    <CreationCard item={{ ...item, id: 'next' }} type="answer" />,
  );
  expect(host.queryByText('更多:next')).toBeNull();
  expect(host.queryByText('收起回答')).toBeNull();
  expect(host.getByText('展开全文')).toBeTruthy();
});
