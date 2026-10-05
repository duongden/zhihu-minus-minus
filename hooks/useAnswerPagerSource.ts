import { useMemo } from 'react';
import type { AnswerDetail } from '@/api/zhihu/answer';
import {
  type AnswerPagerPage,
  getQuestionAnswerPagerPage,
  normalizeAnswerPagerPage,
} from '@/api/zhihu/answerPager';
import { getMemberRelations, MEMBER_ANSWERS_INCLUDE } from '@/api/zhihu/member';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import type { AnswerReadingContext } from '@/utils/answerReadingContext';
import { useZhihuInfiniteQuery } from './useZhihuInfiniteQuery';

export interface AnswerPagerSourceOptions {
  initialId: string;
  questionId?: string | number;
  sortBy: string;
  context: AnswerReadingContext;
  initialAnswer?: AnswerDetail;
}

/** Recommendations keep same-question paging; profiles page the author's answers. */
export function useAnswerPagerSource({
  initialId,
  questionId,
  sortBy,
  context,
  initialAnswer,
}: AnswerPagerSourceOptions) {
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const { scene } = context;
  const isSingleAnswer = scene === 'unknown';
  const isQuestionSource = scene === 'recommend' || scene === 'question_feed';
  const memberId =
    context.memberId?.trim() ||
    initialAnswer?.author.url_token?.trim() ||
    initialAnswer?.author.id;
  const sourceId =
    scene === 'profile_answer'
      ? (memberId ?? '')
      : isQuestionSource
        ? String(questionId ?? initialAnswer?.question?.id ?? '')
        : initialId;
  const sourceSort =
    scene === 'profile_answer'
      ? (context.memberSort ?? 'created')
      : isQuestionSource
        ? sortBy
        : '';
  const queryKey = useMemo(
    () =>
      [
        'answer-pager-source',
        sessionVersion,
        scene,
        sourceId,
        sourceSort,
      ] as const,
    [sessionVersion, scene, sourceId, sourceSort],
  );
  const query = useZhihuInfiniteQuery<AnswerPagerPage>({
    queryKey,
    queryFn: async ({ pageParam, signal }) => {
      if (sessionVersion !== getAuthSessionVersion())
        throw new Error('登录状态已变化');
      if (isSingleAnswer)
        return {
          data: [{ id: initialId }],
          paging: { is_end: true, next: '' },
        };
      if (!sourceId) throw new Error('回答列表来源尚未加载');
      const page =
        scene === 'profile_answer'
          ? normalizeAnswerPagerPage(
              await getMemberRelations(sourceId, 'answers', {
                include: MEMBER_ANSWERS_INCLUDE,
                limit: 20,
                offset: pageParam,
                sort_by: sourceSort,
                ws_qiangzhisafe: 0,
              }),
            )
          : await getQuestionAnswerPagerPage(sourceId, sourceSort, pageParam, {
              signal,
            });
      if (sessionVersion !== getAuthSessionVersion())
        throw new Error('登录状态已变化');
      return page;
    },
    initialPageParam: 0,
    initialData: isSingleAnswer
      ? {
          pages: [
            { data: [{ id: initialId }], paging: { is_end: true, next: '' } },
          ],
          pageParams: [0],
        }
      : undefined,
    enabled: !isSingleAnswer && Boolean(sourceId),
    staleTime: 5 * 60 * 1000,
  });
  return { ...query, pagerKey: JSON.stringify(queryKey), queryKey };
}
