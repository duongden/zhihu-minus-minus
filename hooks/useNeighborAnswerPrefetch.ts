import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getAnswer } from '@/api/zhihu';
import {
  getNeighborAnswerIds,
  RICH_CONTENT_STALE_TIME,
} from '@/features/rich-content';
import { useActiveScreen } from './useActiveScreen';

/** At most two neighboring bodies are fetched; abandoned preloads are cancelled. */
export function useNeighborAnswerPrefetch(
  answerIds: string[],
  currentPage: number,
) {
  const client = useQueryClient();
  const active = useActiveScreen();
  useEffect(() => {
    if (!active || answerIds.length < 2) return;
    const pending = new Set<string>();
    const idle = requestIdleCallback(
      () => {
        for (const id of getNeighborAnswerIds(answerIds, currentPage)) {
          pending.add(id);
          void client.prefetchQuery({
            queryKey: ['answer-detail', id],
            queryFn: ({ signal }) => getAnswer(id, undefined, { signal }),
            staleTime: RICH_CONTENT_STALE_TIME,
            gcTime: 2 * 60 * 1000,
          });
        }
      },
      { timeout: 1500 },
    );
    return () => {
      cancelIdleCallback(idle);
      for (const id of pending) {
        const key = ['answer-detail', id];
        const query = client
          .getQueryCache()
          .find({ queryKey: key, exact: true });
        // A swipe can promote a preload to the visible query before cleanup.
        if (query && !query.isActive())
          void client.cancelQueries({ queryKey: key, exact: true });
      }
    };
  }, [active, answerIds, currentPage, client]);
}
