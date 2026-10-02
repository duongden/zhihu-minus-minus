import { act, fireEvent, render } from '@testing-library/react-native';
import type React from 'react';
import { type FeedItem, voteContent } from '../api/zhihu';
import { FeedCard } from '../components/FeedCard';
import { updateContentInteractionCaches } from '../utils/contentCache';

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
}));
jest.mock('../api/client', () => ({ hasAuthenticationCookie: () => true }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
  FontAwesome6: () => null,
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
jest.mock('../hooks/useCollectionAction', () => ({
  useCollectionAction: () => ({ toggleCollect: jest.fn() }),
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
jest.mock('../components/ShareMenu', () => ({ ShareMenu: () => null }));
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
