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

export default function AnswerDetailScreen() {
  const { id, title: initialTitle, questionId: propQuestionId, sortBy = 'default' } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const colorScheme = useColorScheme();
  const textColor = Colors[colorScheme].text;

  // 1. 获取当前回答的基础信息（主要是为了拿到 questionId）
  const { data: initialAnswer, isLoading: loadingInitial } = useQuery({
    queryKey: ['answer-detail', id],
    queryFn: () => getAnswer(id as string),
    enabled: !!id,
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
    
    // 确保初始 ID 在列表中
    if (id && !listIds.includes(id as string)) {
      return [id as string, ...listIds];
    }
    return listIds.length > 0 ? listIds : [id as string];
  }, [answersData, id]);

  const initialPage = useMemo(() => {
    const index = answerIds.indexOf(id as string);
    return index >= 0 ? index : 0;
  }, [answerIds, id]);

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [isSharing, setIsSharing] = useState(false);

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

      <PagerView
        key={`pager-${questionId}-${answerIds.length}`}
        style={{ flex: 1 }}
        initialPage={initialPage}
        onPageSelected={(e) => {
          const newIndex = e.nativeEvent.position;
          setCurrentPage(newIndex);
          const newId = answerIds[newIndex];
          if (newId) {
            router.setParams({ id: newId });
          }
          
          // 如果滑到了最后几个，预加载下一页
          if (newIndex >= answerIds.length - 3 && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
      >
        {answerIds.map((aid) => (
          <View key={aid} className="flex-1">
            <AnswerDetailView
              id={aid}
              initialTitle={aid === id ? (initialTitle as string) : undefined}
              questionId={questionId as string}
            />
          </View>
        ))}
      </PagerView>

      {/* 固定在顶部的返回按钮 */}
      <Pressable
        onPress={() => router.back()}
        className="absolute left-2.5 z-[100] w-10 h-10 justify-center items-center"
        style={{ top: insets.top + 8 }}
      >
        <Ionicons name="chevron-back" size={28} color={textColor} />
      </Pressable>

      {/* 固定在顶部的分享按钮 */}
      <Pressable
        onPress={() => setIsSharing(true)}
        className="absolute right-2.5 z-[100] w-10 h-10 justify-center items-center"
        style={{ top: insets.top + 8 }}
      >
        <Ionicons name="share-outline" size={24} color={textColor} />
      </Pressable>

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
