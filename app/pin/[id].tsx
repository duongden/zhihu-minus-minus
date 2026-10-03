import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { recordReadHistory } from '@/api/zhihu/history';
import { followMember, unfollowMember } from '@/api/zhihu/member';
import { getPin } from '@/api/zhihu/pin';
import { getContentVoteCount, getContentVoteState } from '@/api/zhihu/voters';
import { BouncyButton } from '@/components/BouncyButton';
import { FollowButton } from '@/components/FollowButton';
import { LikeButton } from '@/components/LikeButton';
import { PinPollCard } from '@/components/PinPollCard';
import { QueryErrorView } from '@/components/QueryErrorView';
import { ReadingProgressNotice } from '@/components/ReadingProgressNotice';
import { ShareMenu } from '@/components/ShareMenu';
import { StableAvatar } from '@/components/StableAvatar';
import { Text, ThemedIcon, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { VoterListModal } from '@/components/VoterListModal';
import Colors from '@/constants/Colors';
import { RICH_CONTENT_STALE_TIME, ZhihuContent } from '@/features/rich-content';
import { useOptimisticToggle } from '@/hooks/useOptimisticToggle';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuPin, ZhihuPinPoll } from '@/types/zhihu';
import { formatDateTime } from '@/utils/date';
import { getZhihuErrorStatus } from '@/utils/zhihuError';

export default function PinDetailScreen() {
  const colorScheme = useColorScheme();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const textColor = Colors[colorScheme].text;
  const backgroundColor = Colors[colorScheme].background;

  const primaryColor = useThemeColor({}, 'primary');
  const primaryTransparent = useThemeColor({}, 'primaryTransparent');

  const [isSharing, setIsSharing] = React.useState(false);
  const [votersVisible, setVotersVisible] = React.useState(false);
  const scrollViewRef = React.useRef<ScrollView>(null);

  const {
    data: pin,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['pin-detail', id],
    queryFn: () => getPin(id as string),
    staleTime: RICH_CONTENT_STALE_TIME,
    retry: (failureCount, err) =>
      getZhihuErrorStatus(err) === 404 ? false : failureCount < 2,
  });

  const readingProgress = useReadingProgress({
    contentKey: `pin:${String(id ?? '')}`,
    enabled: Boolean(id),
    ready: Boolean(pin),
    scrollRef: scrollViewRef,
  });

  const poll = pin?.bottom_poll?.voting as ZhihuPinPoll | undefined;
  const pinVoteCount = getContentVoteCount('pins', pin) ?? 0;
  const pinVoteState = getContentVoteState('pins', pin) ?? 0;
  const enableBrowseHistory = useSettingsStore((s) => s.enableBrowseHistory);

  useEffect(() => {
    if (enableBrowseHistory && pin?.id) {
      recordReadHistory({ content_token: String(pin.id), content_type: 'pin' });
    }
  }, [enableBrowseHistory, pin?.id]);

  const followMutation = useOptimisticToggle<Pick<ZhihuPin, 'author'>>({
    queryKey: ['pin-detail', id],
    mutationFn: async () => {
      const author = pin?.author;
      if (!author) throw new Error('想法尚未加载');
      if (author.is_following)
        return unfollowMember(author.url_token || author.id);
      return followMember(author.url_token || author.id);
    },
    isActive: pin?.author?.is_following,
    onUpdateCache: (old) => ({
      ...old,
      author: {
        ...old.author,
        is_following: !old.author.is_following,
      },
    }),
    successMessage: (isActive) => (isActive ? '已取消关注' : '已关注'),
  });

  const goToProfile = useCallback(() => {
    const token = pin?.author?.url_token || pin?.author?.id;
    if (token) router.push(`/user/${token}`);
  }, [pin?.author, router]);

  if (isLoading && !pin)
    return (
      <View type="default" className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color={primaryColor} />
        <Text type="secondary" className="mt-2.5">
          载入想法中...喵
        </Text>
      </View>
    );

  if (!pin && isError)
    return (
      <View type="default" className="flex-1 justify-center items-center px-6">
        <QueryErrorView message="想法加载失败" onRetry={() => void refetch()} />
      </View>
    );

  if (!pin)
    return (
      <View type="default" className="flex-1 justify-center items-center px-6">
        <Ionicons
          name="compass-outline"
          size={48}
          color={Colors[colorScheme].textSecondary}
        />
        <Text className="text-base font-bold mt-4 mb-2">
          你似乎来到了没有知识存在的荒原
        </Text>
        <Text type="secondary" className="text-xs text-center mb-6">
          该想法可能已被删除、失效或暂不可见 喵~
        </Text>
        <BouncyButton
          onPress={() => router.back()}
          className="px-4 py-2 rounded-full"
          style={{ backgroundColor: primaryTransparent }}
        >
          <Text className="text-xs font-bold" style={{ color: primaryColor }}>
            返回上一页
          </Text>
        </BouncyButton>
      </View>
    );

  return (
    <View type="default" className="flex-1">
      <Stack.Screen
        options={{
          headerTitle: '想法详情',
          headerShadowVisible: false,
          headerStyle: { backgroundColor },
          headerTintColor: textColor,
          headerRight: () => (
            <BouncyButton
              className="p-2 rounded-full"
              onPress={() => setIsSharing(true)}
              style={{ marginRight: 10 }}
            >
              <ThemedIcon name="share-outline" size={24} colorType="default" />
            </BouncyButton>
          ),
        }}
      />

      <ShareMenu
        visible={isSharing}
        onClose={() => setIsSharing(false)}
        type="pin"
        data={
          pin
            ? {
                id: pin.id,
                author: pin.author?.name,
                authorHeadline: pin.author?.headline,
                url: `https://www.zhihu.com/pin/${id}`,
              }
            : null
        }
      />

      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        scrollEventThrottle={16}
        onScroll={(event) =>
          readingProgress.onScroll(event.nativeEvent.contentOffset.y)
        }
        onLayout={readingProgress.onLayout}
        onContentSizeChange={readingProgress.onContentSizeChange}
        onScrollEndDrag={readingProgress.commitProgress}
        onMomentumScrollEnd={readingProgress.commitProgress}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
      >
        {/* 作者信息栏 */}
        <View className="flex-row items-center p-5 justify-between bg-transparent">
          <BouncyButton
            onPress={goToProfile}
            className="flex-row items-center flex-1 bg-transparent"
          >
            <StableAvatar
              uri={pin?.author?.avatar_url}
              className="w-11 h-11 rounded-full"
            />
            <View className="ml-3 flex-1 bg-transparent">
              <Text className="text-base font-bold">{pin?.author?.name}</Text>
              {pin?.author?.headline ? (
                <Text
                  type="secondary"
                  className="text-[13px] mt-0.5"
                  numberOfLines={1}
                >
                  {pin.author.headline}
                </Text>
              ) : null}
            </View>
          </BouncyButton>
          <FollowButton
            following={Boolean(pin?.author?.is_following)}
            loading={followMutation.isPending}
            onPress={() => followMutation.mutate()}
          />
        </View>

        {/* 想法内容 */}
        <View className="px-5 bg-transparent">
          <ZhihuContent
            contentArray={pin?.content}
            objectId={id as string}
            type="pin"
            onRefresh={refetch}
          />
          {poll ? (
            <PinPollCard
              key={`${id}:${poll.id}`}
              poll={poll}
              contentId={String(id)}
            />
          ) : null}
          <Text
            type="secondary"
            className="text-[#bbb] text-[13px] mt-[30px] italic pb-5"
          >
            发布于 {pin?.created ? formatDateTime(pin.created) : '不久前'}{' '}
          </Text>
        </View>
      </ScrollView>

      <ReadingProgressNotice
        visible={readingProgress.restoredOffset !== null}
        onBackToTop={readingProgress.scrollToTop}
        onDismiss={readingProgress.dismissRestoreNotice}
      />

      {/* 底部交互栏 */}
      <View
        className="absolute left-5 right-5 z-[1000]"
        style={[
          colorScheme === 'light' && {
            shadowColor: Colors.light.shadow,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.1,
            shadowRadius: 20,
            elevation: 10,
          },
          { bottom: insets.bottom > 0 ? insets.bottom : 15 },
        ]}
      >
        <BlurView
          intensity={130}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          className="rounded-[32px] overflow-hidden h-16"
          style={{
            backgroundColor: Colors[colorScheme].contentOverlayStrong,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: Colors[colorScheme].contentBorder,
          }}
        >
          <View className="flex-row items-center px-5 h-full bg-transparent">
            <View className="flex-row items-center bg-transparent">
              <LikeButton
                id={pin?.id}
                count={pinVoteCount}
                voted={pinVoteState}
                type="pins"
                variant="minimal"
              />
            </View>
            <View className="flex-1 flex-row justify-end items-center bg-transparent">
              <BouncyButton
                className="items-center justify-center ml-3 p-2 flex-row rounded-full bg-transparent"
                onPress={() => router.push(`/comments/${id}?type=pin`)}
              >
                <ThemedIcon
                  name="chatbubble-outline"
                  size={24}
                  colorType="secondary"
                />
                {pin?.comment_count > 0 && (
                  <Text
                    type="secondary"
                    className="ml-1 text-[13px] font-medium"
                  >
                    {pin?.comment_count}
                  </Text>
                )}
              </BouncyButton>
              <BouncyButton
                className="items-center justify-center ml-3 p-2 flex-row rounded-full bg-transparent"
                onPress={() => setIsSharing(true)}
              >
                <ThemedIcon
                  name="share-social-outline"
                  size={24}
                  colorType="secondary"
                />
              </BouncyButton>
            </View>
          </View>
        </BlurView>
      </View>

      <VoterListModal
        visible={votersVisible}
        onClose={() => setVotersVisible(false)}
        contentType="pin"
        contentId={String(id)}
        count={pinVoteCount}
      />
    </View>
  );
}
