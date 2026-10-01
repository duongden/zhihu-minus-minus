import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { getAnswer } from '../api/zhihu';
import { useNeighborAnswerPrefetch } from '../hooks/useNeighborAnswerPrefetch';

jest.mock('../api/zhihu', () => ({ getAnswer: jest.fn() }));
jest.mock('../features/rich-content', () =>
  jest.requireActual('../features/rich-content/queryPolicy'),
);
let mockActive = true;
jest.mock('../hooks/useActiveScreen', () => ({
  useActiveScreen: () => mockActive,
}));
const ids = ['a', 'b', 'c', 'd', 'e'];

test('only neighbors preload, and cleanup cancels abandoned work while retaining a visible observer', async () => {
  const previousIdle = global.requestIdleCallback;
  const previousCancel = global.cancelIdleCallback;
  global.requestIdleCallback = (callback) => {
    callback({ didTimeout: false, timeRemaining: () => 50 });
    return 1;
  };
  global.cancelIdleCallback = jest.fn();
  jest.mocked(getAnswer).mockImplementation(() => new Promise(() => {}));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const host = await renderHook(
    ({ active }: { active: boolean }) => {
      mockActive = active;
      useNeighborAnswerPrefetch(ids, 2);
    },
    {
      initialProps: { active: true },
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  expect(jest.mocked(getAnswer).mock.calls.map((call) => call[0])).toEqual([
    'b',
    'd',
  ]);
  const bSignal = jest.mocked(getAnswer).mock.calls[0][2]?.signal;
  const dSignal = jest.mocked(getAnswer).mock.calls[1][2]?.signal;
  const observer = new QueryObserver(client, {
    queryKey: ['answer-detail', 'b'],
    queryFn: ({ signal }) => getAnswer('b', undefined, { signal }),
  });
  const unsubscribe = observer.subscribe(() => {});
  await host.rerender({ active: false });
  expect(bSignal?.aborted).toBe(false);
  expect(dSignal?.aborted).toBe(true);
  await act(() => unsubscribe());
  await host.unmount();
  client.clear();
  global.requestIdleCallback = previousIdle;
  global.cancelIdleCallback = previousCancel;
});
