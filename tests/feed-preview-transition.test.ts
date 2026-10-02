import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { withSpring, withTiming } from 'react-native-reanimated';
import type { FeedItem } from '../api/zhihu';
import { CustomContextMenu } from '../components/CustomContextMenu';
import { FeedCardPreview } from '../components/FeedCardPreview';
import type { ZhihuContentProps } from '../features/rich-content/types';

let mockQueryState: {
  data: { content: string } | null | undefined;
  isLoading: boolean;
};
const mockContentProps: ZhihuContentProps[] = [];
const mockUseQuery = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => {
    mockUseQuery(options);
    return mockQueryState;
  },
}));
jest.mock('../api/client', () => ({ hasAuthenticationCookie: () => false }));
jest.mock('../api/zhihu', () => ({
  getAnswer: jest.fn(),
  getArticle: jest.fn(),
  getPin: jest.fn(),
  getQuestion: jest.fn(),
}));
jest.mock('../store/useAuthStore', () => ({
  useAuthStore: (selector: (state: { cookies: null }) => unknown) =>
    selector({ cookies: null }),
}));
jest.mock('../features/rich-content', () => ({
  getRichContentQueryKey: (type: string, id: string) => [type, id],
  hasInlineRichContent: (value: unknown) =>
    typeof value === 'string' ? value.trim().length > 0 : Array.isArray(value),
  RICH_CONTENT_STALE_TIME: 60_000,
  ZhihuContent: (props: ZhihuContentProps) => {
    mockContentProps.push(props);
    return props.renderPlaceholder?.() ?? null;
  },
}));
jest.mock('../components/StableAvatar', () => ({ StableAvatar: () => null }));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#1364cc',
  };
});
jest.mock('../components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('@expo/vector-icons', () => ({
  FontAwesome6: () => null,
  Ionicons: () => null,
}));
jest.mock('expo-blur', () => ({
  BlurView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('../utils/haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View: native.View },
    useSharedValue: (value: number) => react.useRef({ value }).current,
    useAnimatedStyle: (style: () => object) => style(),
    withSpring: jest.fn((value: number) => value),
    withTiming: jest.fn((value: number) => value),
    runOnJS: (callback: () => void) => callback,
  };
});

const item: FeedItem = {
  id: '42',
  type: 'answers',
  title: '预览标题',
  excerpt: '<p>保留<strong>摘要</strong>直到正文就绪</p>',
  author: { id: '7', name: '示例作者', avatar: '' },
  image: null,
  voteCount: 0,
  commentCount: 0,
  voted: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockContentProps.length = 0;
  mockQueryState = { data: undefined, isLoading: true };
});

describe('feed context-menu preview transitions', () => {
  it('retains the parsed excerpt while fetching and while native content prepares', async () => {
    const preview = await render(
      React.createElement(FeedCardPreview, { item }),
    );
    expect(screen.getByText('保留 摘要 直到正文就绪')).toBeOnTheScreen();
    expect(screen.getByText('正在准备完整内容...')).toBeOnTheScreen();

    mockQueryState = { data: { content: '<p>完整正文</p>' }, isLoading: false };
    await preview.rerender(React.createElement(FeedCardPreview, { item }));
    expect(screen.getByText('保留 摘要 直到正文就绪')).toBeOnTheScreen();
    const placeholder = mockContentProps.at(-1)?.renderPlaceholder;
    expect(placeholder).toBeDefined();
    await preview.rerender(React.createElement(FeedCardPreview, { item }));
    expect(mockContentProps.at(-1)?.renderPlaceholder).toBe(placeholder);

    mockQueryState = { data: null, isLoading: false };
    await preview.rerender(React.createElement(FeedCardPreview, { item }));
    expect(screen.getByText('保留 摘要 直到正文就绪')).toBeOnTheScreen();
    expect(screen.queryByText('正在准备完整内容...')).toBeNull();
  });

  it('fetches full detail for truncated and paid answer previews', async () => {
    const inlineItem = { ...item, content: '<p>不完整正文</p>' };
    const preview = await render(
      React.createElement(FeedCardPreview, {
        item: { ...inlineItem, contentNeedTruncated: true },
      }),
    );
    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true, placeholderData: undefined }),
    );
    await preview.rerender(
      React.createElement(FeedCardPreview, {
        item: { ...inlineItem, answerType: 'PAID' },
      }),
    );
    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true, placeholderData: undefined }),
    );
    await preview.rerender(
      React.createElement(FeedCardPreview, { item: inlineItem }),
    );
    expect(mockUseQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        enabled: false,
        placeholderData: { content: inlineItem.content },
      }),
    );
  });

  it('opens once per visible session and closes toward the latest measured frame', async () => {
    const props = {
      visible: true,
      onClose: jest.fn(),
      previewContent: React.createElement(Text, null, '预览正文'),
      originLayout: { x: 10, y: 20, width: 100, height: 60 },
      options: [
        { key: 'copy', title: '复制', icon: 'copy', onPress: jest.fn() },
      ],
    };
    const menu = await render(React.createElement(CustomContextMenu, props));
    expect(withTiming).not.toHaveBeenCalled();
    const measure = (height: number, y: number) =>
      fireEvent(screen.getByText('预览正文'), 'layout', {
        nativeEvent: { layout: { x: 30, y, width: 320, height } },
      });
    await measure(100, 200);
    expect(withTiming).toHaveBeenCalledTimes(1);
    expect(withTiming).toHaveBeenLastCalledWith(1, { duration: 100 });

    await measure(250, 100);
    await menu.rerender(React.createElement(CustomContextMenu, { ...props }));
    expect(withTiming).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('复制'));
    const closingSprings = jest.mocked(withSpring).mock.calls.slice(-3);
    expect(closingSprings.map(([value]) => value)).toEqual([
      60 - 190,
      50 - 225,
      100 / 320,
    ]);
    expect(withTiming).toHaveBeenLastCalledWith(
      0,
      { duration: 100 },
      expect.any(Function),
    );

    await menu.rerender(
      React.createElement(CustomContextMenu, { ...props, visible: false }),
    );
    await menu.rerender(React.createElement(CustomContextMenu, props));
    expect(withTiming).toHaveBeenCalledTimes(2);
    await measure(180, 140);
    expect(withTiming).toHaveBeenCalledTimes(3);
    expect(withTiming).toHaveBeenLastCalledWith(1, { duration: 100 });
  });
});
