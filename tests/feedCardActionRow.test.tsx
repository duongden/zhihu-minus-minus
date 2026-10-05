import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { voteContent } from '../api/zhihu';
import type { ZhihuPreviewAnswerMetadata } from '../api/zhihu/nextRender';
import { voteContent as downvoteContent } from '../api/zhihu/voters';
import { AnswerPreviewFloatingBar } from '../components/AnswerPreviewFloatingBar';
import { getContentActionBarBottom } from '../components/ContentActionBar';
import { FeedCardActionRow } from '../components/FeedCardActionRow';

jest.mock('../api/zhihu', () => ({
  voteContent: jest.fn(),
  getVoteSuccessMessage: () => '合成结果',
}));
jest.mock('../api/zhihu/voters', () => ({
  voteContent: jest.fn(),
  getVoteSuccessMessage: () => '合成结果',
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View: native.View },
    useSharedValue: <T,>(value: T) => react.useRef({ value }).current,
    useAnimatedStyle: (callback: () => unknown) => callback(),
    withSequence: (...values: number[]) => values.at(-1),
    withSpring: (value: number) => value,
    withTiming: (value: number) => value,
  };
});
jest.mock('expo-blur', () => ({
  BlurView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return ({ name, size }: { name: string; size: number }) =>
    react.createElement(native.Text, {
      testID: `icon:${name}`,
      style: { fontSize: size },
    });
});
jest.mock('../components/VoteTriangle', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    VoteTriangle: ({ size, direction }: { size: number; direction: string }) =>
      react.createElement(native.Text, {
        testID: direction === 'down' ? 'downvote-icon' : 'vote-icon',
        style: { fontSize: size },
      }),
  };
});
jest.mock('../components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#1364cc',
    useRuntimeThemeColors: () => ({
      shadow: '#000000',
      textSecondary: '#1364cc',
      link: '#1364cc',
      contentOverlayStrong: '#ffffff',
      contentBorder: '#cccccc',
    }),
  };
});
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('../utils/contentCache', () => ({
  updateContentInteractionCaches: jest.fn(),
}));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test('inline actions keep compact vote and comment controls on the left and more on the right', async () => {
  const onComments = jest.fn();
  const onMore = jest.fn();
  const onVoteChange = jest.fn();
  jest.mocked(voteContent).mockResolvedValue({ voted: 1, voteCount: 20 });
  const host = await render(
    <FeedCardActionRow
      id="answer-a"
      voteCount={19}
      voted={0}
      engagementType="answers"
      commentCount={7}
      commentAccessibilityLabel="查看评论"
      onVoteChange={onVoteChange}
      onComments={onComments}
      onMore={onMore}
    />,
  );
  expect(host.getByTestId('vote-icon')).toHaveStyle({ fontSize: 16 });
  expect(host.queryByTestId('downvote-icon')).toBeNull();
  expect(host.getByTestId('icon:chatbubble-outline')).toHaveStyle({
    fontSize: 16,
  });
  const row = host.container.queryAll(
    (node) =>
      node.type === 'View' &&
      node.props.className === 'flex-row items-center bg-transparent',
  )[0];
  expect(row).toBeTruthy();
  const commentButton = host.getByRole('button', { name: '查看评论' });
  expect(commentButton.props.className).toContain('ml-4 py-1 px-3');
  expect(host.getByText('7').props.className).toBe(
    'ml-1 text-xs font-semibold',
  );
  const moreButton = host.getByRole('button', { name: '更多操作' });
  expect(moreButton).toHaveStyle({ marginLeft: 'auto', marginRight: -8 });
  await fireEvent.press(commentButton);
  expect(onComments).toHaveBeenCalledTimes(1);
  await fireEvent.press(moreButton);
  expect(onMore).toHaveBeenCalledTimes(1);
  await fireEvent.press(host.getAllByRole('button')[0]);
  expect(voteContent).toHaveBeenCalledWith('answer-a', 'answers', 'up');
  await waitFor(() => expect(onVoteChange).toHaveBeenCalledWith(1, 20));
});

test('preview answer actions add a matching downvote control that follows the current answer', async () => {
  const props = {
    id: 'answer-a',
    voteCount: 19,
    voted: 0,
    engagementType: 'answers' as const,
    commentCount: 7,
    showDownvote: true,
    onComments: jest.fn(),
    onMore: jest.fn(),
  };
  const host = await render(<FeedCardActionRow {...props} />);
  expect(host.getByTestId('downvote-icon')).toHaveStyle({ fontSize: 16 });
  expect(host.getByTestId('vote-icon')).toHaveStyle({ fontSize: 16 });
  expect(host.getByRole('button', { name: '反对' })).toBeTruthy();
  await host.rerender(
    <FeedCardActionRow {...props} id="answer-b" voted={-1} />,
  );
  jest.mocked(downvoteContent).mockResolvedValue({ voted: 0, voteCount: 19 });
  await fireEvent.press(host.getByRole('button', { name: '取消反对' }));
  expect(downvoteContent).toHaveBeenCalledWith(
    'answer-b',
    'answers',
    'neutral',
  );
  await waitFor(() =>
    expect(host.getByRole('button', { name: '反对' })).toBeTruthy(),
  );
});

test('non-engagement cards retain their more action without vote or comment controls', async () => {
  const onMore = jest.fn();
  const host = await render(
    <FeedCardActionRow
      id="question-a"
      voteCount={0}
      voted={0}
      engagementType={null}
      commentCount={0}
      onComments={jest.fn()}
      onMore={onMore}
    />,
  );
  expect(host.queryByTestId('vote-icon')).toBeNull();
  expect(host.queryByTestId('icon:chatbubble-outline')).toBeNull();
  expect(host.getAllByRole('button')).toHaveLength(1);
  await fireEvent.press(host.getByRole('button', { name: '更多操作' }));
  expect(onMore).toHaveBeenCalledTimes(1);
});

test('floating bar keeps later answer collapse while a fixed first answer has only vote, comment and more', async () => {
  const answer: ZhihuPreviewAnswerMetadata = {
    id: 'answer-a',
    type: 'answer',
    question: { id: 'question-a', title: '合成问题' },
    author: { id: '', name: '', url_token: '', avatar_url: '', headline: '' },
    excerpt: '',
    voteup_count: 19,
    comment_count: 7,
    favlists_count: 0,
    relationship: { is_author: false, is_favorited: false, voting: 0 },
  };
  const onCollapse = jest.fn();
  const onMore = jest.fn();
  const host = await render(
    <AnswerPreviewFloatingBar
      answer={answer}
      visible
      bottomInset={0}
      onCollapse={onCollapse}
      onMore={onMore}
    />,
  );
  await fireEvent.press(host.getByRole('button', { name: '收起当前回答' }));
  expect(onCollapse).toHaveBeenCalledWith(answer.id);
  await host.rerender(
    <AnswerPreviewFloatingBar
      answer={answer}
      visible
      bottomInset={0}
      canCollapse={false}
      onCollapse={onCollapse}
      onMore={onMore}
    />,
  );
  expect(host.queryByRole('button', { name: '收起当前回答' })).toBeNull();
  expect(host.getByRole('button', { name: '7 条回答评论' })).toBeTruthy();
  await fireEvent.press(host.getByRole('button', { name: '回答更多操作' }));
  expect(onMore).toHaveBeenCalledWith(answer);
});

test.each([
  [0, 0, 12],
  [8, 0, 12],
  [12, 0, 12],
  [34, 0, 34],
  [8, 10, 18],
  [34, 10, 44],
])('floating bar clearance preserves safe-area and offsets (%d, %d)', (inset, offset, bottom) => {
  expect(getContentActionBarBottom(inset, offset)).toBe(bottom);
});
