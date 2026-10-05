import { Ionicons } from '@expo/vector-icons';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { recordReadHistory } from '@/api/zhihu/history';
import {
  getNextContentRender,
  getStructuredContentContinuation,
  type ZhihuPreviewAnswer,
  type ZhihuPreviewLoginPrompt,
} from '@/api/zhihu/nextRender';
import {
  DetailNavigationHeader,
  useDetailNavigationHeight,
} from '@/components/DetailNavigationHeader';
import { LikeButton } from '@/components/LikeButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { ShareMenu } from '@/components/ShareMenu';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useRuntimeThemeColors, View } from '@/components/Themed';
import {
  mergeStructuredContentPages,
  ZhihuStructuredContent,
} from '@/features/rich-content';
import { useAnswerPreviewQuery } from '@/hooks/useAnswerPreviewQuery';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuStructuredContent as StructuredContent } from '@/types/zhihu';
import { refreshInfiniteQuery, shouldRetryQuery } from '@/utils/query';
import { getZhihuErrorMessage } from '@/utils/zhihuError';
import { BouncyButton } from './BouncyButton';

type PreviewItem = ZhihuPreviewAnswer | ZhihuPreviewLoginPrompt;
const initialContentIds = new WeakMap<StructuredContent, number>();
let initialContentSequence = 0;

/** Cache identity is local; neither prose nor opaque continuation URLs become keys. */
function initialContentId(content: StructuredContent): number {
  const existing = initialContentIds.get(content);
  if (existing !== undefined) return existing;
  const identity = ++initialContentSequence;
  initialContentIds.set(content, identity);
  return identity;
}

interface AnswerPreviewCardProps {
  item: ZhihuPreviewAnswer;
  sessionVersion: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onDetail: () => void;
  onMore: () => void;
  onRefresh: () => void;
}

const AnswerPreviewCard = React.memo(function AnswerPreviewCard({
  item,
  sessionVersion,
  expanded,
  onExpandedChange,
  onDetail,
  onMore,
  onRefresh,
}: AnswerPreviewCardProps) {
  const router = useRouter();
  const colors = useRuntimeThemeColors();
  const initialContent = item.structuredContent;
  const sourceId = initialContentId(initialContent);
  const body = useInfiniteQuery({
    queryKey: ['answer-preview-content', sessionVersion, item.id, sourceId],
    initialPageParam: undefined as string | undefined,
    initialData: { pages: [initialContent], pageParams: [undefined] },
    enabled: false,
    staleTime: Infinity,
    queryFn: async ({ pageParam, signal }) => {
      if (getAuthSessionVersion() !== sessionVersion)
        throw new Error('会话已变化');
      if (!pageParam) return initialContent;
      return getNextContentRender(pageParam, { signal, sessionVersion });
    },
    getNextPageParam: (_lastPage, pages, _lastParam, pageParams) =>
      getStructuredContentContinuation(pages, pageParams).next,
    retry: shouldRetryQuery,
  });
  const content = useMemo(
    () =>
      body.data?.pages.length
        ? mergeStructuredContentPages(body.data.pages)
        : initialContent,
    [body.data?.pages, initialContent],
  );
  const continuation = useMemo(
    () =>
      body.data
        ? getStructuredContentContinuation(
            body.data.pages,
            body.data.pageParams,
          )
        : {},
    [body.data],
  );
  const loadError = body.isFetchNextPageError
    ? getZhihuErrorMessage(body.error)
    : continuation.error;
  const loadMore = continuation.next
    ? () => {
        if (!body.isFetchingNextPage)
          void body.fetchNextPage({ cancelRefetch: false });
      }
    : undefined;

  return (
    <View
      style={{
        backgroundColor: colors.backgroundSecondary,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <Text className="text-lg font-bold mb-3">{item.question.title}</Text>
      <BouncyButton
        className="flex-row items-center mb-3"
        onPress={() => {
          const memberId = item.author.url_token || item.author.id;
          if (memberId)
            router.push({ pathname: '/user/[id]', params: { id: memberId } });
        }}
      >
        <StableAvatar
          uri={item.author.avatar_url}
          style={{ width: 32, height: 32, borderRadius: 16 }}
        />
        <View className="ml-2 flex-1 bg-transparent">
          <Text className="font-semibold">{item.author.name}</Text>
          {item.author.headline ? (
            <Text type="secondary" numberOfLines={1} className="text-xs">
              {item.author.headline}
            </Text>
          ) : null}
        </View>
      </BouncyButton>
      <ZhihuStructuredContent
        content={content}
        documentId={`answer-preview:${sessionVersion}:${item.id}:${sourceId}`}
        objectId={item.id}
        renderer="shared"
        onRefresh={onRefresh}
        previewSegmentCount={3}
        expanded={expanded}
        onExpandedChange={(nextExpanded) => {
          onExpandedChange(nextExpanded);
          if (
            nextExpanded &&
            body.data?.pages.length === 1 &&
            !body.isFetchNextPageError
          )
            loadMore?.();
        }}
        hasMore={Boolean(continuation.next)}
        isLoadingMore={body.isFetchingNextPage}
        loadMoreError={loadError}
        onLoadMore={loadMore}
        expandLabel="展开回答"
        collapseLabel="收起回答"
        showFallbackNotice={false}
      />
      {!expanded && loadError ? (
        <Text type="secondary" className="mt-3">
          {loadError}
        </Text>
      ) : null}
      <View className="flex-row items-center justify-between mt-3 bg-transparent">
        <LikeButton
          id={item.id}
          count={item.voteup_count}
          voted={item.relationship.voting}
          variant="minimal"
        />
        <BouncyButton
          accessibilityRole="button"
          accessibilityLabel="查看评论"
          className="flex-row items-center px-2 py-2"
          onPress={() => router.push(`/comments/${item.id}?type=answer`)}
        >
          <Ionicons
            name="chatbubble-outline"
            size={18}
            color={colors.textSecondary}
          />
          <Text type="secondary" className="ml-1 text-xs">
            {item.comment_count}
          </Text>
        </BouncyButton>
        <BouncyButton
          accessibilityRole="button"
          onPress={onDetail}
          className="px-2 py-2"
        >
          <Text style={{ color: colors.link }}>进入详情</Text>
        </BouncyButton>
        <BouncyButton
          accessibilityRole="button"
          accessibilityLabel="更多操作"
          onPress={onMore}
          className="px-2 py-2"
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={20}
            color={colors.textSecondary}
          />
        </BouncyButton>
      </View>
    </View>
  );
});

export interface AnswerPreviewListProps {
  answerId: string;
  questionId?: string;
  title?: string;
  sortBy?: string;
}

/** Entered after a normal answer card; list and each body page independently. */
export function AnswerPreviewList({
  answerId,
  questionId,
  title,
  sortBy,
}: AnswerPreviewListProps) {
  const router = useRouter();
  const colors = useRuntimeThemeColors();
  const insets = useSafeAreaInsets();
  const navigationHeight = useDetailNavigationHeight();
  const queryClient = useQueryClient();
  const query = useAnswerPreviewQuery({ answerId, questionId });
  const listRef = useRef<FlashListRef<PreviewItem>>(null);
  const scope = `${query.sessionVersion}:${answerId}:${questionId ?? ''}`;
  const enableBrowseHistory = useSettingsStore(
    (state) => state.enableBrowseHistory,
  );
  const recordedHistory = useRef({ scope, ids: new Set<string>() });
  const recordAnswer = useCallback(
    (id: string) => {
      if (
        !enableBrowseHistory ||
        getAuthSessionVersion() !== query.sessionVersion
      )
        return;
      if (recordedHistory.current.scope !== scope)
        recordedHistory.current = { scope, ids: new Set() };
      if (recordedHistory.current.ids.has(id)) return;
      recordedHistory.current.ids.add(id);
      recordReadHistory({ content_token: id, content_type: 'answer' });
    },
    [enableBrowseHistory, scope, query.sessionVersion],
  );
  useEffect(() => recordAnswer(answerId), [recordAnswer, answerId]);
  const [expandedState, setExpandedState] = useState({
    scope,
    ids: new Set<string>(),
  });
  const [menuState, setMenuState] = useState<{
    scope: string;
    item: ZhihuPreviewAnswer;
  } | null>(null);
  const activeMenu = menuState?.scope === scope ? menuState.item : null;
  const anchorIndex = query.items.findIndex(
    (item) => item.type === 'answer' && item.id === answerId,
  );
  const openDetail = useCallback(
    (id: string, itemQuestionId?: string, itemTitle?: string) => {
      router.push({
        pathname: '/answer/[id]',
        params: {
          id,
          readingMode: 'detail',
          ...(itemQuestionId ? { questionId: itemQuestionId } : {}),
          ...(itemTitle ? { title: itemTitle } : {}),
          ...(sortBy ? { sortBy } : {}),
        },
      });
    },
    [router, sortBy],
  );
  const refreshBody = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: query.queryKey });
  }, [queryClient, query.queryKey]);
  const screenTitle =
    title ||
    query.items.find((item) => item.type === 'answer')?.question.title ||
    '回答预览';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <DetailNavigationHeader
        title={screenTitle}
        collapsed
        onBack={() => router.back()}
        onTitlePress={() =>
          listRef.current?.scrollToOffset({ offset: 0, animated: true })
        }
      />
      {query.isPending ? (
        <ActivityIndicator
          style={{ marginTop: insets.top + navigationHeight + 40 }}
          color={colors.link}
        />
      ) : query.isError && query.items.length === 0 ? (
        <View style={{ marginTop: insets.top + navigationHeight }}>
          <QueryErrorView
            message={getZhihuErrorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
          <BouncyButton
            onPress={() => openDetail(answerId, questionId, title)}
            className="items-center py-3"
          >
            <Text style={{ color: colors.link }}>进入所选回答详情</Text>
          </BouncyButton>
        </View>
      ) : (
        <FlashList<PreviewItem>
          key={scope}
          ref={listRef}
          data={query.items}
          initialScrollIndex={Math.max(0, anchorIndex)}
          keyExtractor={(item) => `${item.type}:${item.id}`}
          getItemType={(item) => item.type}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: insets.top + navigationHeight + 12,
            paddingBottom: insets.bottom + 20,
          }}
          renderItem={({ item }) =>
            item.type === 'login_prompt' ? (
              <View
                className="items-center p-5 rounded-2xl mb-3"
                style={{ backgroundColor: colors.backgroundSecondary }}
              >
                <Text type="secondary" className="mb-3 text-center">
                  {item.description || '登录后继续阅读更多回答'}
                </Text>
                <BouncyButton onPress={() => router.push('/login')}>
                  <Text style={{ color: colors.link }}>去登录</Text>
                </BouncyButton>
              </View>
            ) : (
              <AnswerPreviewCard
                item={item}
                sessionVersion={query.sessionVersion}
                expanded={
                  expandedState.scope === scope &&
                  expandedState.ids.has(item.id)
                }
                onExpandedChange={(expanded) => {
                  if (expanded) recordAnswer(item.id);
                  setExpandedState((current) => {
                    const ids = new Set(
                      current.scope === scope ? current.ids : [],
                    );
                    if (expanded) ids.add(item.id);
                    else ids.delete(item.id);
                    return { scope, ids };
                  });
                }}
                onDetail={() =>
                  openDetail(item.id, item.question.id, item.question.title)
                }
                onMore={() => setMenuState({ scope, item })}
                onRefresh={refreshBody}
              />
            )
          }
          onEndReached={() => {
            if (
              query.hasNextPage &&
              !query.isFetchingNextPage &&
              !query.isFetchNextPageError
            )
              void query.fetchNextPage({ cancelRefetch: false });
          }}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => {
                setExpandedState({ scope, ids: new Set() });
                void refreshInfiniteQuery(queryClient, query.queryKey);
              }}
              tintColor={colors.link}
              colors={[colors.link]}
            />
          }
          ListHeaderComponent={
            anchorIndex < 0 ? (
              <BouncyButton
                onPress={() => openDetail(answerId, questionId, title)}
                className="items-center py-3 mb-3"
              >
                <Text style={{ color: colors.link }}>进入所选回答详情</Text>
              </BouncyButton>
            ) : null
          }
          ListEmptyComponent={
            <Text type="secondary" className="text-center py-10">
              暂无可预览的回答
            </Text>
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <ActivityIndicator
                style={{ paddingVertical: 20 }}
                color={colors.link}
              />
            ) : query.isFetchNextPageError ? (
              <QueryErrorView
                compact
                message={getZhihuErrorMessage(query.error)}
                onRetry={() => void query.fetchNextPage()}
              />
            ) : query.paginationError ? (
              <Text type="secondary" className="text-center py-5">
                {query.paginationError}
              </Text>
            ) : query.items.length > 0 && !query.hasNextPage ? (
              <Text type="secondary" className="text-center py-5">
                没有更多回答了
              </Text>
            ) : null
          }
        />
      )}
      <ShareMenu
        visible={Boolean(activeMenu)}
        onClose={() => setMenuState(null)}
        type="answer"
        data={
          activeMenu
            ? {
                id: activeMenu.id,
                title: activeMenu.question.title,
                questionId: activeMenu.question.id,
                author: activeMenu.author.name,
                authorHeadline: activeMenu.author.headline,
                excerpt: activeMenu.excerpt,
                isCollected: activeMenu.relationship.is_favorited,
              }
            : null
        }
      />
    </View>
  );
}
