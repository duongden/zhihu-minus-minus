import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  buildZhihuNextRenderUrl,
  getAnswerPreviewContinuation,
  getNextRender,
} from '@/api/zhihu/nextRender';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';

export interface AnswerPreviewQueryOptions {
  answerId: string;
  questionId?: string;
  sessionId?: string;
  cursor?: string;
  enabled?: boolean;
}

export function useAnswerPreviewQuery({
  answerId,
  questionId = '',
  sessionId = '',
  cursor = '',
  enabled = true,
}: AnswerPreviewQueryOptions) {
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const initialUrl = useMemo(
    () =>
      buildZhihuNextRenderUrl({
        id: answerId,
        type: 'answer',
        scenes: 'question_feed',
        collection_id: questionId,
        collection_type: 'question',
        question_feed_session_id: sessionId,
        question_feed_cursor: cursor,
        context_expand: 1,
        is_native: 1,
      }),
    [answerId, questionId, sessionId, cursor],
  );
  const queryKey = useMemo(
    () => ['answer-preview-list', initialUrl, sessionVersion] as const,
    [initialUrl, sessionVersion],
  );
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      getNextRender(pageParam, { signal, sessionVersion }),
    initialPageParam: initialUrl,
    getNextPageParam: (_latest, pages, _latestParam, pageParams) =>
      getAnswerPreviewContinuation(pages, pageParams).next,
    enabled: enabled && Boolean(answerId),
    staleTime: 5 * 60 * 1000,
  });
  const items = useMemo(() => {
    const latestItems = new Map<
      string,
      NonNullable<typeof query.data>['pages'][number]['data'][number]
    >();
    for (const page of query.data?.pages ?? [])
      for (const item of page.data)
        latestItems.set(`${item.type}:${item.id}`, item);
    return [...latestItems.values()];
  }, [query.data]);
  const paginationError = query.data
    ? getAnswerPreviewContinuation(query.data.pages, query.data.pageParams)
        .error
    : undefined;
  return { ...query, items, queryKey, sessionVersion, paginationError };
}
