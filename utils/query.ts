import type {
  InfiniteData,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query';

/**
 * Custom refresh handler for TanStack useInfiniteQuery.
 * Instead of refetching all pages loaded so far, it trims the query cache to just the first page
 * and then triggers refetch. This dramatically reduces unnecessary API calls and avoids
 * "refetching multiple pages in parallel" on pull-to-refresh.
 *
 * @param queryClient The active QueryClient instance
 * @param queryKey The query key of the infinite query
 * @param refetch The refetch function returned from useInfiniteQuery
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
