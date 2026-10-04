import { Ionicons } from '@expo/vector-icons';
import {
  FlashList,
  type FlashListRef,
  useRecyclingState,
} from '@shopify/flash-list';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  View as NativeView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  RefreshControl,
} from 'react-native-gesture-handler';
import Reanimated, {
  interpolate,
  runOnJS,
  SharedTransition,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hasAuthenticationCookie } from '@/api/client';
import {
  type AnswerDetail,
  deleteAnswer,
  type QuestionAnswersResponse,
} from '@/api/zhihu/answer';
import { recordReadHistory } from '@/api/zhihu/history';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import {
  followQuestion,
  getQuestion,
  getQuestionAnswers,
  unfollowQuestion,
  type ZhihuQuestionDetail,
} from '@/api/zhihu/question';
import { BouncyButton } from '@/components/BouncyButton';
import {
  DetailNavigationHeader,
  useDetailNavigationHeight,
} from '@/components/DetailNavigationHeader';
import { FollowButton } from '@/components/FollowButton';
import { LikeButton } from '@/components/LikeButton';
import { MoreActionsButton } from '@/components/MoreActionsButton';
import { QueryErrorView } from '@/components/QueryErrorView';
import { ShareMenu } from '@/components/ShareMenu';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { RICH_CONTENT_STALE_TIME, ZhihuContent } from '@/features/rich-content';
import {
  type GestureScrollViewRef,
  useGestureScrollView,
} from '@/hooks/useGestureScrollView';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useScrollHeaderAnim } from '@/hooks/useScrollAnimation';
import { useScrollAwareTextSelection } from '@/hooks/useScrollAwareTextSelection';
import { useViewableItems } from '@/hooks/useViewableItems';
import { useAuthStore } from '@/store/useAuthStore';
import { useCollectionStore } from '@/store/useCollectionStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuAuthor } from '@/types/zhihu';
import { formatDate } from '@/utils/date';
import { calculateDetailHeaderAppearance } from '@/utils/detailHeaderAppearance';
import { refreshInfiniteQuery } from '@/utils/query';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

const AnimatedFlashList = Reanimated.createAnimatedComponent(
  FlashList,
) as typeof FlashList;

type AnswerSort = 'default' | 'created';

interface AnswerItemHandle {
  measureFooter: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
  id: string;
}

interface AnswerItemProps {
  item: AnswerDetail;
  isExpanded: boolean;
  onToggle: (id: string, expanded: boolean) => void;
  onMore?: (item: AnswerDetail) => void;
  questionId: string;
  sortBy: AnswerSort;
  isAuthenticated: boolean;
  screenTranslateX: SharedValue<number>;
  scrollGestureRef: GestureScrollViewRef;
  onSwipeStart?: (author: ZhihuAuthor) => void;
  onSwipeComplete?: (author: ZhihuAuthor) => void;
  onSwipeCancel?: () => void;
}

const AnswerItem = forwardRef<AnswerItemHandle, AnswerItemProps>(
  (
    {
      item,
      isExpanded,
      onToggle,
      onMore,
      questionId,
      sortBy,
      isAuthenticated,
      screenTranslateX,
      scrollGestureRef,
      onSwipeStart,
      onSwipeComplete,
      onSwipeCancel,
    }: AnswerItemProps,
    ref,
  ) => {
    const { width: screenWidth } = useWindowDimensions();
    const colorScheme = useColorScheme();
    const router = useRouter();
    const _textColor = Colors[colorScheme].text;
    const footerRef = useRef<NativeView>(null);

    const primaryColor = useThemeColor({}, 'primary');
    const cardBackground = useThemeColor({}, 'backgroundSecondary');

    const isFirstMount = useRef(true);
    const animationItemIdRef = useRef(item.id);
    const [measuredHeight, setMeasuredHeight] = useRecyclingState(0, [item.id]);
    // isMounted: ZhihuContent is only mounted after first expansion (perf optimization for long content)
    const [isMounted, setIsMounted] = useRecyclingState(
      () => isExpanded,
      [item.id],
    );
    const expandedProgress = useSharedValue(isExpanded ? 1 : 0);
    const borderProgress = useSharedValue(0);
    const { isTextSelectable, touchCaptureHandlers } =
      useScrollAwareTextSelection(item.id.toString());

    React.useLayoutEffect(() => {
      const itemChanged = animationItemIdRef.current !== item.id;
      animationItemIdRef.current = item.id;

      if (isFirstMount.current || itemChanged) {
        isFirstMount.current = false;
        expandedProgress.value = isExpanded ? 1 : 0;
        borderProgress.value = 0;
        if (isExpanded && !isMounted) {
          setIsMounted(true);
        }
        return;
      }

      expandedProgress.value = withTiming(isExpanded ? 1 : 0, {
        duration: 300,
      });

      if (isExpanded && !isMounted) {
        setIsMounted(true);
      }

      if (!isExpanded) {
        borderProgress.value = withSequence(
          withTiming(1, { duration: 150 }),
          withDelay(600, withTiming(0, { duration: 250 })),
        );
      }
    }, [
      borderProgress,
      expandedProgress,
      isExpanded,
      isMounted,
      item.id,
      setIsMounted,
    ]);

    const animatedContentStyle = useAnimatedStyle(() => {
      if (measuredHeight === 0) {
        return { height: 'auto' };
      }
      const height = interpolate(
        expandedProgress.value,
        [0, 1],
        [150, measuredHeight],
      );
      return { height };
    });

    const animatedReadMoreStyle = useAnimatedStyle(() => {
      const opacity = interpolate(expandedProgress.value, [0, 1], [1, 0]);
      return { opacity };
    });

    const animatedBorderStyle = useAnimatedStyle(() => {
      return {
        borderColor: primaryColor,
        opacity: borderProgress.value,
      };
    });

    const panGesture = useMemo(
      () =>
        Gesture.Pan()
          .enabled(Boolean(item.author?.url_token))
          .activeOffsetX(-15)
          .failOffsetY([-8, 8])
          .simultaneousWithExternalGesture(scrollGestureRef)
          .onStart(() => {
            if (item.author && onSwipeStart) {
              runOnJS(onSwipeStart)(item.author);
            }
          })
          .onUpdate((event) => {
            // 只允许向左侧滑动（偏移量 <= 0）
            screenTranslateX.value = Math.min(0, event.translationX);
          })
          .onEnd((event) => {
            if (event.translationX < -120 && item.author && onSwipeComplete) {
              screenTranslateX.value = withTiming(
                -screenWidth,
                { duration: 250 },
                (finished) => {
                  if (finished) {
                    runOnJS(onSwipeComplete)(item.author);
                  }
                },
              );
            } else {
              screenTranslateX.value = withTiming(0, { duration: 250 });
              if (onSwipeCancel) {
                runOnJS(onSwipeCancel)();
              }
            }
          })
          .onFinalize((_event, success) => {
            if (!success) {
              screenTranslateX.value = withTiming(0, { duration: 250 });
              if (onSwipeCancel) {
                runOnJS(onSwipeCancel)();
              }
            }
          }),
      [
        item.author,
        onSwipeComplete,
        onSwipeCancel,
        onSwipeStart,
        scrollGestureRef,
        screenTranslateX,
        screenWidth,
      ],
    );

    useImperativeHandle(ref, () => ({
      measureFooter: (callback) => footerRef.current?.measureInWindow(callback),
      id: item.id.toString(),
    }));

    const rawText = item.content?.replace(/<[^>]+>/g, '') || '';
    const isLongContent =
      rawText?.length > 120 ||
      item.content?.includes('<img') ||
      item.content?.includes('<figure');
    const excerpt = isLongContent ? `${rawText.substring(0, 100)}...` : rawText;

    // Shared meta info component to avoid repetition
    const metaText = [
      item.created_time ? `发布于 ${formatDate(item.created_time)}` : null,
      item.updated_time ? `编辑于 ${formatDate(item.updated_time)}` : null,
      item.ip_info ? item.ip_info : null,
    ]
      .filter(Boolean)
      .join('  ·  ');

    const MetaInfo = metaText ? (
      <View
        style={{
          paddingTop: 4,
        }}
        className="bg-transparent"
      >
        <Text
          style={{
            fontSize: 12,
            color: Colors[colorScheme].textSecondary,
            opacity: 0.7,
          }}
        >
          {metaText}
        </Text>
      </View>
    ) : null;

    const followMutation = useOptimisticToggle<
      InfiniteData<QuestionAnswersResponse, number | string>
    >({
      queryKey: ['question-answers', questionId, sortBy, isAuthenticated],
      mutationFn: async () => {
        const pid = item.author?.url_token || item.author?.id;
        if (!pid) return;
        if (item.author?.is_following) return unfollowMember(pid);
        return followMember(pid);
      },
      isActive: item.author?.is_following,
      onUpdateCache: (old) => ({
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: page.data?.map((answer) =>
            answer.id.toString() === item.id?.toString()
              ? {
                  ...answer,
                  author: {
                    ...answer.author,
                    is_following: !answer.author.is_following,
                  },
                }
              : answer,
          ),
        })),
      }),
      successMessage: (isActive) => (isActive ? '已取消关注' : '已关注'),
    });

    return (
      <GestureDetector gesture={panGesture}>
        <View
          {...touchCaptureHandlers}
          style={{
            backgroundColor: cardBackground,
            borderRadius: 12,
            position: 'relative',
          }}
          className="p-4 mb-2.5 mx-1.5"
        >
          {/* Glowing border hint overlay */}
          <Reanimated.View
            style={[
              animatedBorderStyle,
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 12,
                borderWidth: 2,
                pointerEvents: 'none',
                zIndex: 999,
              },
            ]}
          />
          <View className="flex-row items-center mb-3 bg-transparent">
            <BouncyButton
              onPress={() =>
                item.author?.url_token &&
                router.push(`/user/${item.author.url_token}`)
              }
              className="flex-row flex-1 items-center bg-transparent"
            >
              <StableAvatar
                uri={item.author?.avatar_url}
                className="w-[34px] h-[34px] rounded-[17px]"
              />
              <View className="flex-1 ml-2.5 bg-transparent">
                <Text className="text-[15px] font-bold">
                  {item.author?.name}
                </Text>
                {item.author?.headline ? (
                  <Text
                    type="secondary"
                    className="text-xs mt-0.5"
                    numberOfLines={1}
                  >
                    {item.author.headline}
                  </Text>
                ) : null}
              </View>
            </BouncyButton>
            {!item.relationship?.is_author && (
              <FollowButton
                following={Boolean(item.author?.is_following)}
                loading={followMutation.isPending}
                onPress={() => followMutation.mutate()}
              />
            )}
          </View>

          <View className="mt-1 bg-transparent">
            {!isLongContent ? (
              // Short content: render directly
              <View className="flex-1 bg-transparent">
                <ZhihuContent
                  objectId={item.id.toString()}
                  type="answer"
                  content={item.content}
                  segmentInfos={item.segment_infos}
                  linkCardInfo={item.link_card_info}
                  useNative={true}
                  selectable={isTextSelectable}
                />
                {MetaInfo}
              </View>
            ) : !isMounted ? (
              // Long content, never expanded: plain-text excerpt styled like ZhihuContent <p>
              <View className="flex-1 bg-transparent">
                {/* Text + gradient overlay in a relative container */}
                <View style={{ position: 'relative', height: 180 }}>
                  <View style={{ height: 180, overflow: 'hidden' }}>
                    <Text
                      style={{
                        fontSize: 17,
                        lineHeight: 17 * 1.5,
                        color: Colors[colorScheme].text,
                        marginBottom: 14,
                      }}
                    >
                      {excerpt}
                    </Text>
                  </View>
                  {/* Gradient fades out the bottom of the text, tap to expand */}
                  <Pressable
                    onPress={() => onToggle(item.id.toString(), true)}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 150,
                    }}
                  >
                    <LinearGradient
                      colors={[`${cardBackground}00`, cardBackground]}
                      style={{
                        flex: 1,
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        paddingBottom: 6,
                      }}
                    >
                      <Text
                        className="text-[13px] font-bold"
                        style={{ color: primaryColor }}
                      >
                        展开全文
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </View>
                {MetaInfo}
              </View>
            ) : (
              // Long content, mounted (expanded at least once): full ZhihuContent with animation
              <View
                className="flex-1 bg-transparent"
                style={{ position: 'relative' }}
              >
                <Reanimated.View
                  style={[
                    animatedContentStyle,
                    { overflow: 'hidden', alignSelf: 'stretch' },
                  ]}
                  className="bg-transparent"
                >
                  <View
                    onLayout={(e) => {
                      const h = e.nativeEvent.layout.height;
                      if (h > 0) {
                        setMeasuredHeight(h);
                      }
                    }}
                    style={{ width: '100%' }}
                    className="bg-transparent"
                  >
                    <ZhihuContent
                      objectId={item.id.toString()}
                      type="answer"
                      content={item.content}
                      segmentInfos={item.segment_infos}
                      linkCardInfo={item.link_card_info}
                      selectable={isTextSelectable}
                    />
                    {MetaInfo}
                    <BouncyButton
                      onPress={() =>
                        item?.id && onToggle(item.id.toString(), false)
                      }
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 10,
                        marginTop: 4,
                      }}
                    >
                      <Text
                        className="text-[13px] font-bold mr-1"
                        style={{ color: primaryColor }}
                      >
                        收起回答
                      </Text>
                      <Ionicons
                        name="chevron-up"
                        size={14}
                        color={primaryColor}
                      />
                    </BouncyButton>
                  </View>
                </Reanimated.View>

                <Reanimated.View
                  style={[
                    animatedReadMoreStyle,
                    {
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 100,
                    },
                  ]}
                  pointerEvents={isExpanded ? 'none' : 'auto'}
                >
                  <Pressable
                    onPress={() => onToggle(item.id.toString(), true)}
                    className="absolute inset-0"
                  >
                    <LinearGradient
                      colors={[`${cardBackground}00`, cardBackground]}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: 0,
                        bottom: 0,
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        paddingBottom: 6,
                      }}
                    >
                      <Text
                        className="text-[13px] font-bold"
                        style={{ color: primaryColor }}
                      >
                        展开全文
                      </Text>
                    </LinearGradient>
                  </Pressable>
                </Reanimated.View>
              </View>
            )}
          </View>

          <NativeView
            ref={footerRef}
            className="flex-row items-center pt-1 px-1 bg-transparent"
          >
            <View className="flex-row items-center bg-transparent">
              <LikeButton
                id={item.id}
                count={item.voteup_count}
                voted={item.relationship?.voting}
                type="answers"
                variant="ghost"
              />
            </View>
            <BouncyButton
              className="flex-row items-center  bg-transparent py-1.5 px-3 rounded-full"
              onPress={() =>
                router.push({
                  pathname: '/comments/[id]',
                  params: {
                    id: item.id,
                    type: 'answer',
                    count: item.comment_count,
                  },
                })
              }
            >
              <Ionicons
                name="chatbubble-outline"
                size={16}
                color={Colors[colorScheme].iconMuted}
              />
              <Text type="secondary" className="ml-1 text-xs font-semibold">
                {item.comment_count > 0 ? item.comment_count : '0'}
              </Text>
            </BouncyButton>
            <MoreActionsButton
              accessibilityLabel="回答更多操作"
              style={{ marginLeft: 'auto' }}
              onPress={() => onMore?.(item)}
            />
          </NativeView>
        </View>
      </GestureDetector>
    );
  },
);

const slowTransition = SharedTransition.duration(600);

export default function QuestionDetail() {
  const { id, title: initialTitle } = useLocalSearchParams<{
    id: string;
    title?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isAuthenticated = useAuthStore((state) =>
    hasAuthenticationCookie(state.cookies),
  );
  const textColor = useThemeColor({}, 'text');
  const secondaryTextColor = useThemeColor({}, 'textSecondary');
  const navigationHeight = insets.top + useDetailNavigationHeight();
  const queryClient = useQueryClient();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const screenTranslateX = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const titleCollapseOffset = useSharedValue(100);
  const headerProgress = useDerivedValue(() =>
    calculateDetailHeaderAppearance(scrollY.value, titleCollapseOffset.value),
  );
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const { scrollGestureRef, renderScrollComponent } = useGestureScrollView();
  const [swipedAuthor, setSwipedAuthor] = useState<ZhihuAuthor | null>(null);

  const animatedScreenStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: screenTranslateX.value }],
    };
  });

  const animatedPreviewStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: screenTranslateX.value + screenWidth }],
    };
  });

  const handleSwipeComplete = (author: ZhihuAuthor) => {
    if (author?.url_token) {
      router.push(`/user/${author.url_token}`);
    }
    setTimeout(() => {
      screenTranslateX.value = 0;
      setSwipedAuthor(null);
    }, 500);
  };

  const [isRestored, setIsRestored] = useState(false);

  const [sortBy, setSortBy] = useState<AnswerSort>('default');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [menuSelection, setMenuSelection] = useState<{
    questionId: string;
    answer: AnswerDetail | null;
  } | null>(null);
  const menuVisible = menuSelection !== null && menuSelection.questionId === id;
  const selectedAnswer = menuVisible ? (menuSelection?.answer ?? null) : null;

  React.useEffect(() => {
    setMenuSelection((selection) =>
      selection?.questionId === id ? selection : null,
    );
  }, [id]);
  const [detailExpanded, setDetailExpanded] = useState(false);

  const itemRefs = useRef(new Map<string, AnswerItemHandle>());
  const {
    activeItem,
    viewableIdsRef,
    viewabilityConfig,
    onViewableItemsChanged,
  } = useViewableItems<AnswerDetail>();

  const selectedAnswerCollected = useCollectionStore((state) =>
    selectedAnswer
      ? (state.collectedStatusMap[selectedAnswer.id.toString()] ??
        selectedAnswer.relationship?.is_favorited)
      : undefined,
  );

  const deleteMutation = useMutation({
    mutationFn: (answerId: string | number) => deleteAnswer(answerId),
    onMutate: () => ({ questionId: id }),
    onSuccess: (_result, _answerId, context) => {
      Alert.alert('删除成功', '你的回答已删除喵！');
      void queryClient.invalidateQueries({
        queryKey: ['question-answers', context?.questionId || id],
      });
    },
    onError: (error: unknown) => {
      Alert.alert('删除失败', getZhihuErrorMessage(error));
    },
  });

  const confirmDeleteAnswer = (answerId: string | number) => {
    Alert.alert('确认删除', '确定要删除这个回答吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认删除',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(answerId),
      },
    ]);
  };

  const footerAnim = useSharedValue(0);

  const isFloatingShown = useRef(false);
  const flashListRef = useRef<FlashListRef<AnswerDetail>>(null);
  const {
    data: answersData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
    isPending: answersPending,
    isError: answersError,
  } = useInfiniteQuery<
    QuestionAnswersResponse,
    Error,
    InfiniteData<QuestionAnswersResponse, number | string>,
    ['question-answers', string, AnswerSort, boolean],
    number | string
  >({
    queryKey: ['question-answers', id, sortBy, isAuthenticated],
    queryFn: async ({ pageParam = 0 }) => {
      const include =
        'data[*].content,excerpt,voteup_count,comment_count,favlists_count,author.name,author.avatar_url,author.headline,author.is_following,relationship.voting,relationship.is_author,relationship.is_favorited,created_time,updated_time,ip_info,segment_infos';
      return getQuestionAnswers(id as string, pageParam, sortBy, include);
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.paging?.is_end) return undefined;
      return lastPage.paging?.next;
    },
  });

  const handleRefresh = useCallback(() => {
    return refreshInfiniteQuery(
      queryClient,
      ['question-answers', id, sortBy, isAuthenticated],
      refetch,
    );
  }, [queryClient, id, sortBy, isAuthenticated, refetch]);

  const answers = useMemo(() => {
    const all = answersData?.pages.flatMap((page) => page.data) || [];
    const seen = new Set<string>();
    return all.filter((item) => {
      const id = item?.id?.toString();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [answersData]);

  const enableBrowseHistory = useSettingsStore((s) => s.enableBrowseHistory);

  const recordedAnswerIds = useRef(new Set<string>());

  const handleToggleExpand = useCallback(
    (id: string, expanded: boolean) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (expanded) next.add(id);
        else next.delete(id);
        return next;
      });

      if (
        expanded &&
        enableBrowseHistory &&
        !recordedAnswerIds.current.has(id)
      ) {
        recordedAnswerIds.current.add(id);
        recordReadHistory({ content_token: id, content_type: 'answer' });
      }

      if (!expanded) {
        // Collapsing: scroll back to the item to prevent losing context
        // Use setTimeout to ensure the list has updated its layout
        setTimeout(() => {
          const index = answers.findIndex(
            (answer) => answer.id.toString() === id,
          );
          if (index >= 0) {
            flashListRef.current?.scrollToIndex({
              index: index,
              animated: true,
              viewOffset: navigationHeight,
            });
          }
        }, 100);
      }
    },
    [answers, navigationHeight, enableBrowseHistory],
  );

  const getShareLink = (answer: AnswerDetail) => {
    const aid = answer?.id;
    return `https://www.zhihu.com/question/${id}/answer/${aid}`;
  };

  const lastCheckTime = useRef(0);

  const handleScrollEffects = useCallback(
    (currentY: number) => {
      setHeaderCollapsed(currentY >= titleCollapseOffset.value);

      // if (!qLoading && isRestored && currentY > 0) {
      //   saveProgress(id as string, currentY);
      // }

      const now = Date.now();

      if (now - lastCheckTime.current > 100) {
        lastCheckTime.current = now;
        const currentViewableIds = viewableIdsRef.current;
        let anyFooterVisible = false;
        const promises: Promise<boolean>[] = [];

        currentViewableIds.forEach((id) => {
          const ref = itemRefs.current.get(id);
          if (ref) {
            promises.push(
              new Promise((resolve) => {
                ref.measureFooter(
                  (_x: number, y: number, _w: number, _h: number) => {
                    const isVisible =
                      y > navigationHeight && y < screenHeight - 40;
                    resolve(isVisible);
                  },
                );
              }),
            );
          }
        });

        Promise.all(promises).then((results) => {
          anyFooterVisible = results.some((r) => r === true);
          const shouldShow = Boolean(
            !anyFooterVisible &&
              activeItem &&
              expandedIds.has(activeItem.id.toString()) &&
              currentY > 300,
          );

          if (shouldShow !== isFloatingShown.current) {
            isFloatingShown.current = shouldShow;
            footerAnim.value = withTiming(shouldShow ? 1 : 0, {
              duration: 220,
            });
          }
        });
      }
    },
    [
      activeItem,
      expandedIds,
      footerAnim,
      navigationHeight,
      titleCollapseOffset,
      screenHeight,
      viewableIdsRef,
    ],
  );

  const { handleScroll } = useScrollHeaderAnim(
    400,
    handleScrollEffects,
    100,
    scrollY,
  );

  const footerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: footerAnim.value,
    transform: [
      {
        translateY: interpolate(footerAnim.value, [0, 1], [100, 0]),
      },
    ],
  }));

  const primaryColor = useThemeColor({}, 'primary');
  const linkColor = useThemeColor({}, 'link');
  const onPrimaryColor = useThemeColor({}, 'onPrimary');
  const topicBackground = useThemeColor({}, 'backgroundTertiary');
  const toolbarBackground = useThemeColor({}, 'backgroundSecondary');

  const {
    data: question,
    isLoading: qLoading,
    isError: questionError,
    refetch: refetchQuestion,
  } = useQuery({
    queryKey: ['question', id, isAuthenticated],
    queryFn: async () => await getQuestion(id as string),
    staleTime: RICH_CONTENT_STALE_TIME,
  });

  const followMutation = useOptimisticToggle<ZhihuQuestionDetail>({
    queryKey: ['question', id, isAuthenticated],
    isActive: question?.relationship?.is_following,
    mutationFn: async () => {
      if (question?.relationship?.is_following)
        return unfollowQuestion(id as string);
      return followQuestion(id as string);
    },
    onUpdateCache: (old) => ({
      ...old,
      relationship: {
        ...old?.relationship,
        is_following: !old?.relationship?.is_following,
      },
      follower_count: old.relationship?.is_following
        ? Math.max(0, (old.follower_count ?? 0) - 1)
        : (old.follower_count ?? 0) + 1,
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注问题'),
  });

  // 恢复进度逻辑已禁用
  React.useEffect(() => {
    if (!qLoading && question && answers.length > 0 && !isRestored) {
      setIsRestored(true);
      /*
      const savedProgress = getProgress(id as string);
      if (savedProgress > 0) {
        setTimeout(() => {
          flashListRef.current?.scrollToOffset({
            offset: savedProgress,
            animated: false,
          });
          setIsRestored(true);
        }, 300); // Question page is heavier, give it more time
      } else {
        setIsRestored(true);
      }
      */
    }
  }, [qLoading, question, answers.length, isRestored]);

  React.useEffect(() => {
    if (enableBrowseHistory && question?.id) {
      recordReadHistory({
        content_token: String(question.id),
        content_type: 'question',
      });
    }
  }, [enableBrowseHistory, question?.id]);

  const renderHeader = useMemo(
    () => (
      <View>
        <View
          type="surface"
          className="px-5 pb-5"
          style={{
            paddingTop: navigationHeight + 14,
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
          }}
        >
          <Reanimated.View
            sharedTransitionTag={`title-${id}`}
            sharedTransitionStyle={slowTransition}
            onLayout={({ nativeEvent }) => {
              const { y, height } = nativeEvent.layout;
              titleCollapseOffset.value = Math.max(
                1,
                y + height - navigationHeight,
              );
              setHeaderCollapsed(scrollY.value >= titleCollapseOffset.value);
            }}
          >
            <Text
              style={{
                fontSize: 22,
                lineHeight: 30,
                fontWeight: '700',
              }}
            >
              {question?.title || initialTitle || '加载中...'}
            </Text>
          </Reanimated.View>
          {qLoading && !question ? (
            <View className="h-[100px] justify-center">
              <ActivityIndicator size="small" color={primaryColor} />
            </View>
          ) : questionError && !question ? (
            <QueryErrorView
              compact
              message="问题详情加载失败"
              onRetry={() => void refetchQuestion()}
            />
          ) : (
            <>
              {question?.topics?.length ? (
                <View className="flex-row flex-wrap mt-3 gap-1.5">
                  {question.topics.map((topic) => (
                    <BouncyButton
                      key={topic.id}
                      accessibilityRole="button"
                      onPress={() => router.push(`/topic/${topic.id}`)}
                      style={{
                        backgroundColor: topicBackground,
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        type="secondary"
                        style={{ fontSize: 12, lineHeight: 18 }}
                      >
                        {topic.name}
                      </Text>
                    </BouncyButton>
                  ))}
                </View>
              ) : null}
              {question?.detail ? (
                <View className="mt-3 rounded-2xl overflow-hidden">
                  {detailExpanded ? (
                    <>
                      <ZhihuContent
                        content={question.detail}
                        objectId={id as string}
                        type="question"
                      />
                      <BouncyButton
                        accessibilityRole="button"
                        accessibilityLabel="收起问题描述"
                        onPress={() => setDetailExpanded(false)}
                        className="flex-row items-center self-start py-1 mt-1 gap-1"
                      >
                        <Text
                          style={{
                            color: linkColor,
                            fontSize: 13,
                            lineHeight: 20,
                          }}
                        >
                          收起问题描述
                        </Text>
                        <Ionicons
                          name="chevron-up"
                          size={13}
                          color={linkColor}
                        />
                      </BouncyButton>
                    </>
                  ) : (
                    <BouncyButton
                      accessibilityRole="button"
                      accessibilityLabel="展开问题描述"
                      onPress={() => setDetailExpanded(true)}
                    >
                      <Text
                        type="secondary"
                        numberOfLines={3}
                        style={{ fontSize: 14, lineHeight: 22 }}
                      >
                        {question.excerpt?.replace(/<[^>]+>/g, '') || ''}
                      </Text>
                      <View className="flex-row items-center mt-1 gap-1">
                        <Text
                          style={{
                            color: linkColor,
                            fontSize: 13,
                            lineHeight: 20,
                          }}
                        >
                          展开问题描述
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={13}
                          color={linkColor}
                        />
                      </View>
                    </BouncyButton>
                  )}
                </View>
              ) : question?.excerpt ? (
                <Text
                  type="secondary"
                  className="mt-3"
                  numberOfLines={3}
                  style={{ fontSize: 14, lineHeight: 22 }}
                >
                  {question.excerpt.replace(/<[^>]+>/g, '')}
                </Text>
              ) : null}
              <Text
                type="tertiary"
                className="mt-4"
                style={{ fontSize: 12, lineHeight: 18 }}
              >
                {question?.follower_count || 0} 关注 ·{' '}
                {question?.visit_count || 0} 浏览
              </Text>
              <View className="flex-row flex-wrap items-center mt-3.5 gap-2">
                <FollowButton
                  following={Boolean(question?.relationship?.is_following)}
                  loading={followMutation.isPending}
                  accessibilityLabel={
                    question?.relationship?.is_following
                      ? '取消关注问题'
                      : '关注问题'
                  }
                  onPress={() => followMutation.mutate()}
                />
                <BouncyButton
                  accessibilityRole="button"
                  accessibilityLabel={`${question?.comment_count || 0} 条问题评论`}
                  className="flex-row items-center justify-center gap-1.5"
                  style={{ minHeight: 34, paddingHorizontal: 6 }}
                  onPress={() =>
                    router.push({
                      pathname: '/comments/[id]',
                      params: {
                        id,
                        type: 'question',
                        count: question?.comment_count || 0,
                      },
                    })
                  }
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={16}
                    color={secondaryTextColor}
                  />
                  <Text
                    type="secondary"
                    style={{ fontSize: 13, lineHeight: 20 }}
                  >
                    {question?.comment_count || 0} 评论
                  </Text>
                </BouncyButton>
                <View className="flex-1" />
                <BouncyButton
                  accessibilityRole="button"
                  onPress={() => router.push(`/question/write/${id}`)}
                  style={{
                    minHeight: 34,
                    paddingHorizontal: 15,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: primaryColor,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      lineHeight: 21,
                      fontWeight: '600',
                      color: onPrimaryColor,
                    }}
                  >
                    写回答
                  </Text>
                </BouncyButton>
              </View>
            </>
          )}
        </View>
        <View className="mx-5 flex-row justify-between items-center py-3.5 mb-1">
          <Text style={{ fontSize: 15, lineHeight: 22, fontWeight: '600' }}>
            {question?.answer_count || 0} 个回答
          </Text>
          <View className="flex-row items-center gap-4">
            <BouncyButton
              accessibilityRole="button"
              accessibilityState={{ selected: sortBy === 'default' }}
              onPress={() => setSortBy('default')}
              className="py-1"
            >
              <Text
                type={sortBy === 'default' ? 'default' : 'secondary'}
                style={{
                  fontSize: 13,
                  lineHeight: 20,
                  fontWeight: sortBy === 'default' ? '600' : '400',
                }}
              >
                默认
              </Text>
            </BouncyButton>
            <BouncyButton
              accessibilityRole="button"
              accessibilityState={{ selected: sortBy === 'created' }}
              onPress={() => setSortBy('created')}
              className="py-1"
            >
              <Text
                type={sortBy === 'created' ? 'default' : 'secondary'}
                style={{
                  fontSize: 13,
                  lineHeight: 20,
                  fontWeight: sortBy === 'created' ? '600' : '400',
                }}
              >
                时间
              </Text>
            </BouncyButton>
          </View>
        </View>
      </View>
    ),
    [
      qLoading,
      question,
      id,
      initialTitle,
      navigationHeight,
      scrollY,
      titleCollapseOffset,
      sortBy,
      followMutation.mutate,
      followMutation.isPending,
      detailExpanded,
      primaryColor,
      linkColor,
      onPrimaryColor,
      secondaryTextColor,
      topicBackground,
      questionError,
      refetchQuestion,
      router.push,
    ],
  );

  return (
    <View type="default" className="flex-1">
      <Stack.Screen options={{ headerShown: false, title: '问题' }} />

      <ShareMenu
        visible={menuVisible}
        onClose={() => setMenuSelection(null)}
        type={selectedAnswer ? 'answer' : 'question'}
        data={
          selectedAnswer
            ? {
                id: selectedAnswer.id,
                questionId: id,
                title: question?.title || initialTitle,
                author: selectedAnswer.author?.name,
                authorHeadline: selectedAnswer.author?.headline,
                isCollected: selectedAnswerCollected,
                url: getShareLink(selectedAnswer),
              }
            : {
                id,
                title: question?.title || initialTitle,
                url: `https://www.zhihu.com/question/${id}`,
              }
        }
        additionalOptions={
          selectedAnswer?.relationship?.is_author
            ? [
                {
                  key: 'edit',
                  icon: 'create-outline',
                  label: '编辑回答',
                  onPress: () =>
                    router.push(
                      `/question/write/${selectedAnswer.question?.id || id}`,
                    ),
                },
                {
                  key: 'delete',
                  icon: 'trash-outline',
                  label: '删除回答',
                  destructive: true,
                  disabled: deleteMutation.isPending,
                  onPress: () => confirmDeleteAnswer(selectedAnswer.id),
                },
              ]
            : []
        }
      />

      <Reanimated.View style={[{ flex: 1 }, animatedScreenStyle]}>
        <DetailNavigationHeader
          title={question?.title || initialTitle || '问题'}
          collapsed={headerCollapsed}
          progress={headerProgress}
          onBack={() => router.back()}
          onMore={() => setMenuSelection({ questionId: id, answer: null })}
          moreAlwaysVisible
          onTitlePress={() =>
            flashListRef.current?.scrollToOffset({ offset: 0, animated: true })
          }
        />

        <AnimatedFlashList<AnswerDetail>
          ref={flashListRef}
          // Bind the gesture to the actual scroller, not FlashList's outer View.
          renderScrollComponent={renderScrollComponent}
          onScroll={handleScroll}
          data={qLoading ? [] : answers}
          ListHeaderComponent={renderHeader}
          renderItem={({ item }) => (
            <AnswerItem
              ref={(r) => {
                const answerId = item.id.toString();
                if (r) itemRefs.current.set(answerId, r);
                else itemRefs.current.delete(answerId);
              }}
              item={item}
              isExpanded={
                item?.id ? expandedIds.has(item.id.toString()) : false
              }
              onToggle={handleToggleExpand}
              onMore={(answer) => setMenuSelection({ questionId: id, answer })}
              questionId={id}
              sortBy={sortBy}
              isAuthenticated={isAuthenticated}
              screenTranslateX={screenTranslateX}
              scrollGestureRef={scrollGestureRef}
              onSwipeStart={setSwipedAuthor}
              onSwipeComplete={handleSwipeComplete}
              onSwipeCancel={() => setSwipedAuthor(null)}
            />
          )}
          keyExtractor={(item) => `ans-${item.id.toString()}`}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onEndReached={() =>
            hasNextPage && !isFetchingNextPage && fetchNextPage()
          }
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            qLoading ? null : answersPending ? (
              <ActivityIndicator
                style={{ marginTop: 60 }}
                color={primaryColor}
              />
            ) : answersError ? (
              <QueryErrorView
                message="回答列表加载失败"
                onRetry={() => void refetch()}
              />
            ) : (
              <Text type="secondary" className="text-center mt-16 text-sm">
                暂无回答
              </Text>
            )
          }
          ListFooterComponent={() =>
            isFetchingNextPage ? (
              <ActivityIndicator
                style={{ marginVertical: 20 }}
                color={primaryColor}
              />
            ) : answers?.length > 0 && !hasNextPage ? (
              <Text type="secondary" className="text-center my-5">
                — 没有更多回答了 —
              </Text>
            ) : null
          }
          refreshControl={
            <RefreshControl
              onRefresh={handleRefresh}
              refreshing={isRefetching}
            />
          }
        />

        <Reanimated.View
          className="absolute left-5 right-5 h-[54px] rounded-[27px] overflow-hidden z-[1000]"
          style={[
            {
              bottom: insets.bottom,
            },
            colorScheme === 'light' && {
              shadowColor: Colors.light.shadow,
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.2,
              shadowRadius: 15,
              elevation: 10,
            },
            footerAnimatedStyle,
          ]}
        >
          <BlurView
            intensity={95}
            tint={colorScheme}
            className="flex-1"
            style={{
              backgroundColor: `${toolbarBackground}D9`,
            }}
          >
            <View className="flex-1 flex-row items-center px-5 justify-between bg-transparent">
              <View className="flex-row items-center bg-transparent">
                <LikeButton
                  id={activeItem?.id ?? ''}
                  count={activeItem?.voteup_count || 0}
                  voted={activeItem?.relationship?.voting}
                  type="answers"
                  variant="ghost"
                />
                <BouncyButton
                  className="flex-row items-center justify-center ml-3 p-2 bg-transparent"
                  style={{ borderRadius: 99 }}
                  onPress={() => {
                    if (!activeItem) return;
                    router.push({
                      pathname: '/comments/[id]',
                      params: {
                        id: activeItem.id,
                        type: 'answer',
                        count: activeItem.comment_count,
                      },
                    });
                  }}
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={20}
                    color={Colors[colorScheme].textSecondary}
                  />
                  <Text
                    className=" text-sm font-bold"
                    style={{ color: Colors[colorScheme].textSecondary }}
                  >
                    {activeItem?.comment_count || 0}
                  </Text>
                </BouncyButton>

                {activeItem?.id &&
                  expandedIds.has(activeItem.id.toString()) && (
                    <BouncyButton
                      className="flex-row items-center justify-center ml-3 p-2 bg-transparent"
                      style={{ borderRadius: 99 }}
                      onPress={() =>
                        handleToggleExpand(activeItem.id.toString(), false)
                      }
                    >
                      <Ionicons
                        name="chevron-up-circle-outline"
                        size={20}
                        color={primaryColor}
                      />
                      <Text
                        className=" text-sm font-bold"
                        style={{ color: primaryColor }}
                      >
                        收起
                      </Text>
                    </BouncyButton>
                  )}
              </View>
              <MoreActionsButton
                accessibilityLabel="回答更多操作"
                disabled={!activeItem}
                onPress={() => {
                  if (!activeItem) return;
                  setMenuSelection({ questionId: id, answer: activeItem });
                }}
              />
            </View>
          </BlurView>
        </Reanimated.View>
      </Reanimated.View>

      {/* Immersive profile preview panel pulled from the right */}
      {swipedAuthor && (
        <Reanimated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: screenWidth,
              backgroundColor: Colors[colorScheme].background,
              zIndex: 9999,
              paddingTop: insets.top + 60,
              paddingHorizontal: 25,
            },
            animatedPreviewStyle,
          ]}
        >
          <View className="items-center bg-transparent mt-10">
            <StableAvatar
              uri={swipedAuthor.avatar_url}
              style={{ width: 90, height: 90, borderRadius: 45 }}
            />
            <Text
              className="text-xl font-bold mt-4"
              style={{ color: textColor }}
            >
              {swipedAuthor.name}
            </Text>
            {swipedAuthor.headline ? (
              <Text
                type="secondary"
                className="text-center mt-2 px-5 text-sm"
                numberOfLines={2}
              >
                {swipedAuthor.headline}
              </Text>
            ) : null}

            <View
              className="mt-10 px-5 py-2.5 rounded-full flex-row items-center"
              style={{
                backgroundColor: Colors[colorScheme].backgroundTertiary,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: Colors[colorScheme].textSecondary,
                  marginRight: 6,
                }}
              >
                正在载入个人主页
              </Text>
              <Ionicons
                name="arrow-forward"
                size={16}
                color={Colors[colorScheme].textSecondary}
              />
            </View>
          </View>
        </Reanimated.View>
      )}

      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}
