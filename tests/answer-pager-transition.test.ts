import { act, render } from '@testing-library/react-native';
import React from 'react';
import AnswerDetailScreen from '../app/answer/[id]';

interface PagerProps {
  children?: React.ReactNode;
  initialPage: number;
  onPageSelected: (event: { nativeEvent: { position: number } }) => void;
  onPageScrollStateChanged: (event: {
    nativeEvent: { pageScrollState: string };
  }) => void;
  onPageScroll: (event: {
    nativeEvent: { position: number; offset: number };
  }) => void;
}

interface AnswerProps {
  id: string;
  isFocused: boolean;
}

let mockParams: {
  id: string;
  questionId: string;
  sortBy: string;
};
let mockPages: { data: { id: string }[] }[] | undefined;
let mockPagerProps: PagerProps;
let mockPagerMounts: number;
const mockAnswerProps = new Map<string, AnswerProps>();
const mockAnswerMounts = new Map<string, number>();
const mockSetPage = jest.fn();
const mockSetParams = jest.fn();
const mockFetchNextPage = jest.fn();
const mockRouter = {
  setParams: mockSetParams,
  push: jest.fn(),
  back: jest.fn(),
};
const mockQueryClient = { prefetchQuery: jest.fn(), getQueryData: jest.fn() };
const originalRequestIdleCallback = Object.getOwnPropertyDescriptor(
  globalThis,
  'requestIdleCallback',
);
const originalCancelIdleCallback = Object.getOwnPropertyDescriptor(
  globalThis,
  'cancelIdleCallback',
);

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { question: { id: mockParams.questionId, title: '问题' } },
    isLoading: false,
  }),
  useQueryClient: () => mockQueryClient,
}));
jest.mock('../hooks/useZhihuInfiniteQuery', () => ({
  useZhihuInfiniteQuery: () => ({
    data: mockPages ? { pages: mockPages } : undefined,
    fetchNextPage: mockFetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
  Stack: { Screen: () => null },
}));
jest.mock('react-native-pager-view', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: react.forwardRef((props: PagerProps, ref) => {
      mockPagerProps = props;
      react.useImperativeHandle(ref, () => ({
        setPageWithoutAnimation: mockSetPage,
      }));
      react.useEffect(() => {
        mockPagerMounts += 1;
      }, []);
      return react.createElement(native.View, null, props.children);
    }),
  };
});
jest.mock('../components/AnswerDetailView', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AnswerDetailView: (props: AnswerProps) => {
      mockAnswerProps.set(props.id, props);
      react.useEffect(() => {
        mockAnswerMounts.set(
          props.id,
          (mockAnswerMounts.get(props.id) ?? 0) + 1,
        );
      }, [props.id]);
      return react.createElement(native.Text, null, props.id);
    },
  };
});
jest.mock('../api/client', () => ({ __esModule: true, default: {} }));
jest.mock('../api/zhihu', () => ({ getAnswer: jest.fn() }));
jest.mock('../api/zhihu/history', () => ({ recordReadHistory: jest.fn() }));
jest.mock('../components/ShareMenu', () => ({ ShareMenu: () => null }));
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
jest.mock('../store/useSettingsStore', () => ({
  useSettingsStore: () => false,
}));
jest.mock('../features/rich-content', () => ({
  getNeighborAnswerIds: () => [],
  RICH_CONTENT_STALE_TIME: 300_000,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0 }),
}));
jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View: native.View },
    SharedTransition: { duration: () => ({}) },
    Extrapolate: { CLAMP: 'clamp' },
    interpolate: () => 1,
    useSharedValue: (value: number) => react.useRef({ value }).current,
    useAnimatedStyle: (style: () => object) => style(),
  };
});

function setList(ids: string[]): void {
  mockPages = [{ data: ids.map((id) => ({ id })) }];
}

async function selectPage(position: number, props = mockPagerProps) {
  await act(() => props.onPageSelected({ nativeEvent: { position } }));
}

async function startDrag() {
  await scrollState('dragging');
}

async function scrollState(pageScrollState: string, props = mockPagerProps) {
  await act(() =>
    props.onPageScrollStateChanged({
      nativeEvent: { pageScrollState },
    }),
  );
}

async function scrollPage(position: number, offset: number) {
  await act(() =>
    mockPagerProps.onPageScroll({ nativeEvent: { position, offset } }),
  );
}

function renderedAnswerIds(): string[] {
  return React.Children.toArray(mockPagerProps.children).flatMap((child) => {
    if (
      !React.isValidElement<{
        children: React.ReactElement<AnswerProps>;
      }>(child)
    )
      return [];
    return [child.props.children.props.id];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: '42', questionId: '7', sortBy: 'default' };
  mockPages = undefined;
  mockPagerMounts = 0;
  mockAnswerProps.clear();
  mockAnswerMounts.clear();
  Object.defineProperty(globalThis, 'requestIdleCallback', {
    configurable: true,
    value: jest.fn(() => 1),
  });
  Object.defineProperty(globalThis, 'cancelIdleCallback', {
    configurable: true,
    value: jest.fn(),
  });
});

afterEach(() => {
  if (originalRequestIdleCallback) {
    Object.defineProperty(
      globalThis,
      'requestIdleCallback',
      originalRequestIdleCallback,
    );
  } else Reflect.deleteProperty(globalThis, 'requestIdleCallback');
  if (originalCancelIdleCallback) {
    Object.defineProperty(
      globalThis,
      'cancelIdleCallback',
      originalCancelIdleCallback,
    );
  } else Reflect.deleteProperty(globalThis, 'cancelIdleCallback');
});

describe('answer pager list transitions', () => {
  it('keeps the feed-seeded answer mounted when the question answer list arrives', async () => {
    const page = await render(React.createElement(AnswerDetailScreen));
    const initialPager = mockPagerProps;
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockPagerMounts).toBe(1);

    setList(['11', '42', '99']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockPagerMounts).toBe(1);
    expect(mockAnswerMounts.get('42')).toBe(1);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(false);
    expect(mockSetPage).toHaveBeenLastCalledWith(1);

    await selectPage(0, initialPager);
    await selectPage(0);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockSetParams).not.toHaveBeenCalled();
    await selectPage(1);
    await startDrag();
    await selectPage(2);
    expect(mockAnswerProps.get('99')?.isFocused).toBe(true);
    expect(mockSetParams).toHaveBeenLastCalledWith({ id: '99' });
  });

  it('retains the selected answer identity when a refreshed list reorders its indexes', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await selectPage(2);
    mockSetParams.mockClear();
    setList(['99', '42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockSetPage).toHaveBeenLastCalledWith(0);
    expect(mockAnswerProps.get('99')?.isFocused).toBe(true);
    expect(mockAnswerMounts.get('99')).toBe(1);
    expect(mockPagerMounts).toBe(1);
    await selectPage(2);
    expect(mockAnswerProps.get('99')?.isFocused).toBe(true);
    await selectPage(0);
    expect(mockSetParams).not.toHaveBeenCalled();
    await startDrag();
    await selectPage(1);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockSetParams).toHaveBeenLastCalledWith({ id: '42' });
  });

  it('keeps a selected answer omitted from a list refresh until the reader leaves it', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await selectPage(2);
    setList(['42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockAnswerProps.get('99')?.isFocused).toBe(true);
    expect(mockAnswerMounts.get('99')).toBe(1);
    expect(mockPagerMounts).toBe(1);
    // Keeping the omitted answer makes the rendered page order unchanged.
    expect(mockSetPage).not.toHaveBeenCalled();
    await startDrag();
    await selectPage(1);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
    expect(mockSetParams).toHaveBeenLastCalledWith({ id: '11' });
  });

  it('allows a new selection without dragging after an append that produces no same-position callback', async () => {
    const page = await render(React.createElement(AnswerDetailScreen));
    setList(['42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockSetPage).toHaveBeenLastCalledWith(0);
    await selectPage(1);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
  });

  it('freezes the rendered list when new API data arrives after a drag has started', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await startDrag();
    setList(['99', '42', '11', '100']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(renderedAnswerIds()).toEqual(['42', '11', '99']);
    expect(mockSetPage).not.toHaveBeenCalled();

    await selectPage(1);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
    await scrollState('settling');
    const gesturePager = mockPagerProps;
    await scrollPage(1, 0);
    await scrollState('idle');
    expect(renderedAnswerIds()).toEqual(['99', '42', '11', '100']);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
    expect(mockAnswerMounts.get('11')).toBe(1);
    expect(mockPagerMounts).toBe(1);
    expect(mockSetPage).toHaveBeenLastCalledWith(2);
    await selectPage(1, gesturePager);
    await selectPage(1);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
    await selectPage(2);
    expect(mockSetParams).toHaveBeenLastCalledWith({ id: '11' });
  });

  it('uses the settled native position before applying a list when idle precedes the selected callback', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await startDrag();
    setList(['99', '42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    const gesturePager = mockPagerProps;
    await scrollPage(1, 0);
    await scrollState('idle');
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
    expect(mockSetPage).toHaveBeenLastCalledWith(2);
    expect(mockSetParams).toHaveBeenLastCalledWith({ id: '11' });
    await selectPage(1, gesturePager);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
  });

  it('applies only the latest list after multiple updates during a gesture', async () => {
    setList(['42', '11']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await startDrag();
    setList(['99', '42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    setList(['100', '11', '42']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(renderedAnswerIds()).toEqual(['42', '11']);
    await selectPage(1);
    await scrollState('idle');
    expect(renderedAnswerIds()).toEqual(['100', '11', '42']);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
    // The selected answer stayed at the same index, so no ack gate is needed.
    await selectPage(2);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
  });

  it('accepts native position verification when a moved-page command emits no selected ack', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await selectPage(2);
    setList(['99', '42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockSetPage).toHaveBeenLastCalledWith(0);
    await scrollPage(2, 0);
    await selectPage(2);
    expect(mockAnswerProps.get('99')?.isFocused).toBe(true);
    // Native was already at the desired position and never sent an ack.
    await scrollPage(0, 0);
    await selectPage(1);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
  });

  it('accepts accessibility navigation through settling without a prior drag or command ack', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await selectPage(2);
    setList(['99', '42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    await scrollState('settling');
    await selectPage(1);
    await scrollPage(1, 0);
    await scrollState('idle');
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockSetParams).toHaveBeenLastCalledWith({ id: '42' });
  });

  it('accepts real animated scroll movement without dragging or a selected callback', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await selectPage(2);
    setList(['99', '42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    await scrollPage(0, 0.5);
    setList(['11', '99', '42', '100']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(renderedAnswerIds()).toEqual(['99', '42', '11']);
    await scrollPage(1, 0);
    await scrollState('idle');
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(renderedAnswerIds()).toEqual(['11', '99', '42', '100']);
    expect(mockSetPage).toHaveBeenLastCalledWith(2);
  });

  it.each([
    'questionId',
    'sortBy',
  ] as const)('remounts for a real %s change and resets selection to the route entry answer', async (field) => {
    setList(['42', '11']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await selectPage(1);
    const oldPager = mockPagerProps;
    mockSetParams.mockClear();
    mockParams = {
      ...mockParams,
      [field]: field === 'questionId' ? '8' : 'updated',
    };
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockPagerMounts).toBe(2);
    expect(mockAnswerMounts.get('42')).toBe(2);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockPagerProps.initialPage).toBe(0);
    await selectPage(1, oldPager);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockSetParams).not.toHaveBeenCalled();

    // Returning before native emits a selection for the new identity must
    // not revive the prior question/sort's selected answer.
    mockParams = { id: '42', questionId: '7', sortBy: 'default' };
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockPagerMounts).toBe(3);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
  });

  it('ignores invalid native indexes without changing the focused answer', async () => {
    await render(React.createElement(AnswerDetailScreen));
    for (const index of [-1, 1, 0.5, Number.NaN]) await selectPage(index);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockSetParams).not.toHaveBeenCalled();
  });
});
