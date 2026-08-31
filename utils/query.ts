import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Reset one TanStack infinite query to its initial state and refetch active observers.
 * resetQueries clears every cached page/pageParam for the exact key, so pull-to-refresh
 * requests only the initial page instead of refetching every page loaded so far.
 *
 * @param queryClient The active QueryClient instance
 * @param queryKey The query key of the infinite query
 * The optional trailing arguments remain for compatibility with existing callers.
 */
export async function refreshInfiniteQuery(
  queryClient: QueryClient,
  queryKey: QueryKey,
  _refetch?: () => Promise<unknown>,
  _initialPageParam?: unknown,
) {
  // 重置 InfiniteQuery：清空已加载的所有翻页缓存及 pageParams，回到初始第 1 页重新抓取
  return queryClient.resetQueries({ queryKey, exact: true });
}
