import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState, useEffect } from 'react';
import {
  Pressable,
  ActivityIndicator,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { AnswerDetailView } from '@/components/AnswerDetailView';
import { ShareMenu } from '@/components/ShareMenu';
import { getAnswer } from '@/api/zhihu';
import client from '@/api/client';
import { useZhihuInfiniteQuery } from '@/hooks/useZhihuInfiniteQuery';
import Colors from '@/constants/Colors';
import Reanimated, { SharedTransition } from 'react-native-reanimated';

const slowTransition = SharedTransition.duration(600);

export default function AnswerDetailScreen() {
  const { id, title: initialTitle, questionId: propQuestionId, sortBy = 'default' } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const colorScheme = useColorScheme();
  const textColor = Colors[colorScheme].text;

  // 锁定初始 ID，避免滑动时 URL 参数改变导致重新触发 top-level loading
  const [initialId] = useState(id as string);

  // 1. 获取当前回答的基础信息（主要是为了拿到 questionId）
  const { data: initialAnswer, isLoading: loadingInitial } = useQuery({
    queryKey: ['answer-detail', initialId],
    queryFn: () => getAnswer(initialId),
    enabled: !!initialId,
  });

  const questionId = propQuestionId || initialAnswer?.question?.id;

  // 2. 获取该问题下的所有回答列表
  const {
    data: answersData,
    isLoading: loadingList,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useZhihuInfiniteQuery({
    queryKey: ['question-answers', questionId, sortBy],
    queryFn: async ({ pageParam = 0 }) => {
      const include = 'data[*].id'; // 我们只需要 ID 来构建 Pager
      const res = await client.get(
        `/questions/${questionId}/answers?include=${include}&limit=20&offset=${pageParam}&sort_by=${sortBy}`,
      );
      return res.data;
    },
    enabled: !!questionId,
  });

  // 3. 构建 ID 列表
  const answerIds = useMemo(() => {
    const listIds = answersData?.pages.flatMap((p: any) => p.data).map((i: any) => i.id.toString()) || [];

    let combined = listIds;
    // 确保初始 ID 在列表中
    if (initialId && !listIds.includes(initialId)) {
      combined = [initialId, ...listIds];
    }

    // 使用 Set 去重
    return Array.from(new Set(combined));
  }, [answersData, initialId]);

  const initialPage = useMemo(() => {
    const index = answerIds.indexOf(initialId);
    return index >= 0 ? index : 0;
  }, [answerIds, initialId]);

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [isSharing, setIsSharing] = useState(false);

  // 4. 这里的关键是：PagerView 在 Android 下如果动态改变 children 且没有重置 key，可能会导致页面错乱。
  // 但重置 key 又会导致 WebView 重新加载。
  // 我们使用一个更稳定的 key，仅在数据从“单条”变为“多条”时重置一次。
  const [pagerReady, setPagerReady] = useState(false);
  useEffect(() => {
    if (answerIds.length > 1 && !pagerReady) {
      setPagerReady(true);
    }
  }, [answerIds.length, pagerReady]);

  const pagerKey = `pager-${questionId}-${pagerReady ? 'ready' : 'pending'}`;

  // 同步当前页面的数据，用于分享
  const currentId = answerIds[currentPage];
  const { data: currentAnswer } = useQuery({
    queryKey: ['answer-detail', currentId],
    queryFn: () => getAnswer(currentId as string),
    enabled: !!currentId,
  });

  const getShareLink = () => {
    const actualQid = currentAnswer?.question?.id || questionId;
    return `https://www.zhihu.com/question/${actualQid}/answer/${currentId}`;
  };

  if (loadingInitial && !initialAnswer) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator color={Colors[colorScheme].primary} />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header Bar */}
      <View
        className="flex-row items-center px-2.5"
        style={{
          marginTop: insets.top + 8,
          minHeight: 44,
          backgroundColor: colorScheme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)'
        }}
      >
        {/* 返回按钮 */}
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 justify-center items-center"
        >
          <Ionicons name="chevron-back" size={28} color={textColor} />
        </Pressable>

        {/* 标题区域 */}
        <Pressable
          className="flex-1 mx-2"
          onPress={() =>
            router.push(`/question/${initialAnswer?.question?.id || questionId}`)
          }
        >
          <Reanimated.View
            sharedTransitionTag={`title-${questionId || id}`}
            sharedTransitionStyle={slowTransition}
            className="bg-transparent"
          >
            <Text className="text-[18px] font-bold leading-6" numberOfLines={2}>
              {initialAnswer?.question?.title || (initialTitle as string) || '加载中...'}
            </Text>
          </Reanimated.View>
        </Pressable>

        {/* 分享按钮 */}
        <Pressable
          onPress={() => setIsSharing(true)}
          className="w-10 h-10 justify-center items-center"
        >
          <Ionicons name="share-outline" size={24} color={textColor} />
        </Pressable>
      </View>

      <PagerView
        key={pagerKey}
        style={{ flex: 1 }}
        initialPage={initialPage}
        offscreenPageLimit={1}
        onPageSelected={(e) => {
          const newIndex = e.nativeEvent.position;
          setCurrentPage(newIndex);
          const newId = answerIds[newIndex];
          if (newId) {
            router.setParams({ id: newId });
          }

          // 如果滑到了最后几个，预加载下一页 ID
          if (newIndex >= answerIds.length - 3 && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
      >
        {answerIds.map((aid, index) => (
          <View key={aid} className="flex-1">
            <AnswerDetailView
              id={aid}
              initialTitle={aid === id ? (initialTitle as string) : undefined}
              questionId={questionId as string}
              isFocused={index === currentPage}
              shouldPreload={Math.abs(index - currentPage) <= 1}
            />
          </View>
        ))}
      </PagerView>



      <ShareMenu
        visible={isSharing}
        onClose={() => setIsSharing(false)}
        type="answer"
        data={currentAnswer ? {
          id: currentAnswer.id,
          title: currentAnswer.question?.title,
          author: currentAnswer.author?.name,
          authorHeadline: currentAnswer.author?.headline,
          url: getShareLink()
        } : null}
      />
    </View>
  );
}
