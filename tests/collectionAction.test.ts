import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import {
  fastCollectAnswer,
  getAllContentCollectionStatus,
  removeFromCollection,
} from '../api/zhihu/collection';
import { useCollectionAction } from '../hooks/useCollectionAction';
import { useCollectionStore } from '../store/useCollectionStore';
import { updateContentInteractionCaches } from '../utils/contentCache';

jest.mock('../api/zhihu/collection', () => ({
  fastCollectAnswer: jest.fn(),
  fastCollectArticle: jest.fn(),
  getAllContentCollectionStatus: jest.fn(),
  removeFromCollection: jest.fn(),
  removeArticleFromCollection: jest.fn(),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../utils/contentCache', () => ({
  updateContentInteractionCaches: jest.fn(),
}));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));
let mockSessionVersion = 0;
jest.mock('../store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: () => ({ cookies: 'synthetic-session' }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionVersion = 0;
  useCollectionStore.getState().resetSession();
});

async function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  const host = await renderHook(() => useCollectionAction(), {
    wrapper: ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client }, children),
  });
  return { client, host };
}

test('late quick collection completion cannot repopulate a new session', async () => {
  let finish: (value: Awaited<ReturnType<typeof fastCollectAnswer>>) => void =
    () => {};
  jest.mocked(fastCollectAnswer).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { client, host } = await setup();
  await act(() => host.result.current.collect('original', 'answer'));
  await act(() => {
    mockSessionVersion += 1;
    client.clear();
    useCollectionStore.getState().resetSession();
    finish({ collection: { id: 'folder', title: '合成收藏夹' } });
  });
  await waitFor(() => expect(host.result.current.isPending).toBe(false));
  expect(useCollectionStore.getState().collectedStatusMap).toEqual({});
  expect(useCollectionStore.getState().collectedCountOffsetMap).toEqual({});
  expect(updateContentInteractionCaches).not.toHaveBeenCalled();
  await host.unmount();
  client.clear();
});

test('quick overlapping successes only add one collected count', async () => {
  jest.mocked(fastCollectAnswer).mockResolvedValue({
    collection: { id: 'folder', title: '合成收藏夹' },
  });
  const { client, host } = await setup();
  await act(() => {
    host.result.current.collect('original', 'answer');
    host.result.current.collect('original', 'answer');
  });
  await waitFor(() => expect(host.result.current.isPending).toBe(false));
  expect(useCollectionStore.getState().collectedCountOffsetMap.original).toBe(
    1,
  );
  await host.unmount();
  client.clear();
});

test('a session switch during folder lookup prevents removal using the new account', async () => {
  let finish: (
    value: Awaited<ReturnType<typeof getAllContentCollectionStatus>>,
  ) => void = () => {};
  jest.mocked(getAllContentCollectionStatus).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { client, host } = await setup();
  await act(() => host.result.current.uncollect('original', 'answer'));
  await act(() => {
    mockSessionVersion += 1;
    useCollectionStore.getState().resetSession();
    finish({
      data: [
        {
          id: 'folder',
          title: '合成收藏夹',
          is_public: true,
          is_favorited: true,
        },
      ],
    });
  });
  await waitFor(() => expect(host.result.current.isPending).toBe(false));
  expect(removeFromCollection).not.toHaveBeenCalled();
  expect(useCollectionStore.getState().collectedStatusMap).toEqual({});
  await host.unmount();
  client.clear();
});
