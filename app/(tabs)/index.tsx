import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import React, { useMemo, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import Animated, {
  Extrapolate,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// 使用 @ 别名导入组件
import { FEED_URLS, getFeed } from '@/api/zhihu';
import { DailyList } from '@/components/DailyList';
import { FeedCard } from '@/components/FeedCard';
import { HotCard, HotItem } from '@/components/HotCard';
import ProfileScreen from './profile';
import PublishScreen from './publish';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore, TabKey } from '@/store/useSettingsStore';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const tintColor = Colors.light.tint; // Fallback or use colorScheme logic inside component

// 统一的所有可滑动的页面索引
// 0: 关注, 1: 推荐, 2: 热榜, 3: 日报, 4: 发布, 5: 我的
const TABS = [
  'following',
  'recommend',
  'hot',
  'daily',
  'publish',
  'profile',
] as const;
type TabType = (typeof TABS)[number];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const router = useRouter();
  const { visibleTabs, defaultTab } = useSettingsStore();

  // 动态过滤 Tabs
  const currentTabs = useMemo(() => {
    return (['following', 'recommend', 'hot', 'daily', 'publish', 'profile'] as TabKey[])
      .filter(tab => visibleTabs.includes(tab));
  }, [visibleTabs]);

  // 计算初始页码
  const initialPageIndex = useMemo(() => {
    const idx = currentTabs.indexOf(defaultTab);
    return idx >= 0 ? idx : 0;
  }, [currentTabs, defaultTab]);

  // 核心状态：共享滚动位置
  const scrollX = useSharedValue(initialPageIndex);
  const pagerRef = useRef<PagerView>(null);
  const { cookies } = useAuthStore();

  const tintColor = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const [currentPage, setCurrentPage] = useState(initialPageIndex);
  const [scrolledTabs, setScrolledTabs] = useState<Record<number, boolean>>({});
  const listRefs = useRef<any[]>([]);

  const SCROLL_THRESHOLD_SHOW = 300;
  const SCROLL_THRESHOLD_HIDE = 200;

  const handleScrollUpdate = useCallback((pageIndex: number, offset: number) => {
    setScrolledTabs((prev) => {
      const currentlyScrolled = prev[pageIndex] || false;
      let nextScrolled = currentlyScrolled;

      if (!currentlyScrolled && offset > SCROLL_THRESHOLD_SHOW) {
        nextScrolled = true;
      } else if (currentlyScrolled && offset < SCROLL_THRESHOLD_HIDE) {
        nextScrolled = false;
      }

      if (currentlyScrolled === nextScrolled) return prev;
      return { ...prev, [pageIndex]: nextScrolled };
    });
  }, []);

  const handleHomeTabPress = () => {
    const homeTabs = currentTabs.filter(t => !['publish', 'profile'].includes(t));
    const isAtHome = currentPage < homeTabs.length;

    if (isAtHome && scrolledTabs[currentPage]) {
      // 如果已经在首页 Tab 且已滚动，则置顶
      listRefs.current[currentPage]?.scrollToOffset({ offset: 0, animated: true });
    } else {
      // 否则切换到第一页
      pagerRef.current?.setPage(0);
    }
  };

  const handleTabPress = (index: number) => {
    pagerRef.current?.setPage(index);
  };

  // 顶部导航栏动画样式
  const topNavAnimStyle = useAnimatedStyle(() => {
    // 当滑动到 index 4 (发布) 及以后时，顶部导航渐隐
    const opacity = interpolate(
      scrollX.value,
      [3, 4],
      [1, 0],
      Extrapolate.CLAMP,
    );
    const translateY = interpolate(
      scrollX.value,
      [3, 4],
      [0, -100],
      Extrapolate.CLAMP,
    );
    return {
      opacity,
      transform: [{ translateY }],
      pointerEvents: scrollX.value > 3.5 ? 'none' : 'auto',
    };
  });

  // 顶部 Tab 指示器动画
  const topIndicatorStyle = useAnimatedStyle(() => {
    const tabWidth = 58;
    return {
      transform: [{ translateX: scrollX.value * tabWidth }],
    };
  });

  // 底部导航栏指示器动画
  const bottomIndicatorStyle = useAnimatedStyle(() => {
    // 家 (Home) 包含除了 publish 和 profile 以外的所有
    const homeTabsCount = currentTabs.filter(t => !['publish', 'profile'].includes(t)).length;
    const hasPublish = currentTabs.includes('publish');
    const hasProfile = currentTabs.includes('profile');

    // 底部导航栏总图标数 (首页算一个)
    const totalBottomIcons = (homeTabsCount > 0 ? 1 : 0) + (hasPublish ? 1 : 0) + (hasProfile ? 1 : 0);
    const iconWidth = (SCREEN_WIDTH - 40) / (totalBottomIcons || 1);

    // 计算平滑位移
    // 映射逻辑：将 scrollX (0~N) 映射到 底部图标索引 (0~M)
    const homeEndIndex = homeTabsCount > 0 ? homeTabsCount - 1 : -1;

    // 构建插值映射表
    const inputRange: number[] = [];
    const outputRange: number[] = [];

    // 1. 首页区域：无论在首页内怎么滑，底部指示器都在索引 0 (如果是存在的)
    if (homeTabsCount > 0) {
      inputRange.push(0, homeEndIndex);
      outputRange.push(0, 0);
    }

    // 2. 发布区域
    if (hasPublish) {
      const publishIdx = currentTabs.indexOf('publish');
      const bottomIdx = homeTabsCount > 0 ? 1 : 0;
      inputRange.push(publishIdx);
      outputRange.push(bottomIdx * iconWidth);
    }

    // 3. 个人区域
    if (hasProfile) {
      const profileIdx = currentTabs.indexOf('profile');
      const bottomIdx = (homeTabsCount > 0 ? 1 : 0) + (hasPublish ? 1 : 0);
      inputRange.push(profileIdx);
      outputRange.push(bottomIdx * iconWidth);
    }

    // 确保 inputRange 是递增且唯一的（防止计算错误）
    const translateX = interpolate(
      scrollX.value,
      inputRange.length > 1 ? inputRange : [0, 1],
      outputRange.length > 1 ? outputRange : [0, 0],
      Extrapolate.CLAMP
    );

    return {
      transform: [{ translateX }],
    };
  });

  return (
    <View style={styles.container}>
      {/* 1. 顶部 Tab 导航 (Home 专属) */}
      <Animated.View
        style={[
          styles.topNavContainer,
          { top: insets.top },
          topNavAnimStyle,
        ]}
      >
        <BlurView
          intensity={100}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          style={[
            styles.blurWrapper,
            {
              backgroundColor:
                colorScheme === 'dark'
                  ? 'rgba(0,0,0,0.7)'
                  : 'rgba(255,255,255,0.85)',
            },
          ]}
        >
          <View style={styles.topNav}>
            <View
              style={{
                flexDirection: 'row',
                flex: 1,
                backgroundColor: 'transparent',
                alignItems: 'center',
                position: 'relative',
              }}
            >
              <Animated.View
                style={[
                  styles.topPill,
                  { backgroundColor: tintColor + '15' },
                  topIndicatorStyle,
                ]}
              />
              {currentTabs
                .filter(t => !['publish', 'profile'].includes(t))
                .map((tab, index) => {
                  const labels: Record<string, string> = {
                    following: '关注',
                    recommend: '推荐',
                    hot: '热榜',
                    daily: '日报',
                  };
                  return (
                    <Pressable
                      key={tab}
                      onPress={() => handleTabPress(index)}
                      style={styles.navItem}
                    >
                      <Text
                        style={[
                          styles.navText,
                          currentPage === index && {
                            fontWeight: 'bold',
                            color: tintColor,
                          },
                        ]}
                        type={currentPage === index ? 'default' : 'secondary'}
                      >
                        {labels[tab]}
                      </Text>
                    </Pressable>
                  );
                })}
            </View>
            <Pressable
              onPress={() => router.push('/search')}
              style={styles.searchBtn}
            >
              <Ionicons name="search" size={22} color={textColor} />
            </Pressable>
          </View>
        </BlurView>
      </Animated.View>

      <PagerView
        key={`pager-${currentTabs.join('-')}`} // 强制重新渲染
        ref={pagerRef}
        style={styles.pager}
        initialPage={initialPageIndex}
        onPageScroll={(e) => {
          scrollX.value = e.nativeEvent.position + e.nativeEvent.offset;
        }}
        onPageSelected={(e) => {
          setCurrentPage(e.nativeEvent.position);
        }}
      >
        {currentTabs.map((tab, idx) => {
          const globalIndex = (['following', 'recommend', 'hot', 'daily', 'publish', 'profile'] as TabKey[]).indexOf(tab);
          const isHomeTab = !['publish', 'profile'].includes(tab);

          return (
            <View key={tab} style={{ flex: 1, backgroundColor: 'transparent' }}>
              {globalIndex === 3 ? (
                <DailyList
                  ref={el => listRefs.current[idx] = el}
                  insets={insets}
                  onScroll={(offset) => handleScrollUpdate(idx, offset)}
                />
              ) : globalIndex === 4 ? (
                <PublishScreen />
              ) : globalIndex === 5 ? (
                <ProfileScreen />
              ) : !cookies ? (
                <View style={styles.loginPrompt}>
                  <Text style={styles.loginText} type="secondary">
                    登录后才能看此栏目哦
                  </Text>
                  <Pressable
                    style={[styles.loginBtn, { backgroundColor: tintColor }]}
                    onPress={() => router.push('/login' as any)}
                  >
                    <Text style={styles.loginBtnText}>去登录</Text>
                  </Pressable>
                </View>
              ) : (
                <FeedList
                  ref={el => listRefs.current[idx] = el}
                  tab={tab as any}
                  insets={insets}
                  onScroll={(offset) => handleScrollUpdate(idx, offset)}
                />
              )}
            </View>
          );
        })}
      </PagerView>

      {/* 3. 底部悬浮导航栏 (Custom TabBar) */}
      <View style={[styles.bottomBarContainer, { bottom: insets.bottom }]}>
        <BlurView
          intensity={130}
          tint={colorScheme === 'dark' ? 'dark' : 'light'}
          style={[
            styles.bottomBlur,
            {
              backgroundColor:
                colorScheme === 'dark'
                  ? 'rgba(0,0,0,0.7)'
                  : 'rgba(255,255,255,0.85)',
            },
          ]}
        >
          <View style={styles.bottomNavItems}>
            {/* 联动指示器 */}
            <Animated.View
              style={[
                styles.bottomIndicator,
                {
                  backgroundColor: tintColor + '15',
                  width: (SCREEN_WIDTH - 40) / ((currentTabs.filter(t => !['publish', 'profile'].includes(t)).length > 0 ? 1 : 0) + (currentTabs.includes('publish') ? 1 : 0) + (currentTabs.includes('profile') ? 1 : 0)) - 20
                },
                bottomIndicatorStyle,
              ]}
            />

            {currentTabs.some(t => !['publish', 'profile'].includes(t)) && (
              <BottomTabIcon
                // 判断逻辑：当前在首页区域且当前子 Tab 有滚动
                isScrollTop={currentPage < currentTabs.filter(t => !['publish', 'profile'].includes(t)).length && scrolledTabs[currentPage]}
                icon={currentPage < currentTabs.filter(t => !['publish', 'profile'].includes(t)).length ? 'home' : 'home-outline'}
                active={currentPage < currentTabs.filter(t => !['publish', 'profile'].includes(t)).length}
                onPress={handleHomeTabPress}
                color={
                  currentPage < currentTabs.filter(t => !['publish', 'profile'].includes(t)).length ? tintColor : Colors[colorScheme].textSecondary
                }
              />
            )}

            {currentTabs.includes('publish') && (
              <BottomTabIcon
                icon={currentTabs[currentPage] === 'publish' ? 'add-circle' : 'add'}
                active={currentTabs[currentPage] === 'publish'}
                onPress={() => handleTabPress(currentTabs.indexOf('publish'))}
                color={
                  currentTabs[currentPage] === 'publish'
                    ? tintColor
                    : Colors[colorScheme].textSecondary
                }
                size={currentTabs[currentPage] === 'publish' ? 28 : 24}
              />
            )}

            {currentTabs.includes('profile') && (
              <BottomTabIcon
                icon={currentTabs[currentPage] === 'profile' ? 'person' : 'person-outline'}
                active={currentTabs[currentPage] === 'profile'}
                onPress={() => handleTabPress(currentTabs.indexOf('profile'))}
                color={
                  currentTabs[currentPage] === 'profile'
                    ? tintColor
                    : Colors[colorScheme].textSecondary
                }
              />
            )}
          </View>
        </BlurView>
      </View>
    </View>
  );
}

const AnimatedIcon = Animated.createAnimatedComponent(Ionicons);

function BottomTabIcon({ icon, active, onPress, color, size = 24, isScrollTop }: any) {
  // 动画状态
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  // 当置顶状态切换时播放动画
  React.useEffect(() => {
    scale.value = withSequence(
      withTiming(0.6, { duration: 150 }),
      withTiming(1, { duration: 150 })
    );
  }, [isScrollTop]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Pressable onPress={onPress} style={styles.bottomTabItem}>
      <Animated.View style={animatedStyle}>
        <Ionicons
          name={isScrollTop ? 'arrow-up-circle' : icon}
          size={isScrollTop ? size + 4 : size}
          color={isScrollTop ? color : color}
        />
      </Animated.View>
    </Pressable>
  );
}

// FeedList 组件
const FeedList = React.forwardRef<
  any,
  { tab: TabType; insets: any; onScroll?: (offset: number) => void }
>(({ tab, insets, onScroll }, ref) => {
  const { cookies } = useAuthStore();
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isRefetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['zhihu-feed', tab],
    queryFn: async ({ pageParam = (FEED_URLS as any)[tab] }) => {
      if (!cookies && (tab === 'following' || tab === 'recommend'))
        return { items: [], nextUrl: null };
      try {
        const data = await getFeed(pageParam as string);
        const rawItems = data.data || [];
        let items;
        if (tab === 'following')
          items = rawItems
            .map((item: any) => parseFollowingData(item))
            .filter(Boolean);
        else if (tab === 'recommend')
          items = rawItems.map((item: any) => parseRecommendData(item));
        else
          items = rawItems.map((item: any, index: number) =>
            parseHotData(item, index),
          );
        return {
          items,
          nextUrl: data.paging?.next?.replace('http://', 'https://'),
        };
      } catch (e: any) {
        return { items: [], nextUrl: null };
      }
    },
    initialPageParam: (FEED_URLS as any)[tab],
    getNextPageParam: (lastPage) => lastPage.nextUrl,
    enabled: !!cookies,
  });

  const flattenedData = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <FlashList
      ref={ref}
      data={flattenedData}
      onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
      onEndReachedThreshold={0.5}
      onRefresh={refetch}
      refreshing={isRefetching}
      onScroll={(e) => onScroll?.(e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={100}
      contentContainerStyle={{
        paddingTop: insets.top + 70,
        paddingBottom: 120,
      }}
      renderItem={({ item }: { item: any }) =>
        tab === 'hot' ? <HotCard item={item} /> : <FeedCard item={item} tab={tab} />
      }
      ListFooterComponent={
        isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} /> : null
      }
    />
  );
});

// 数据解析函数保持不变 (省略以节省空间，实际代码中应保留)
function parseFollowingData(item: any) {
  const target = item.target;
  if (!target) return null;
  const type = target.type;
  let appType: 'answers' | 'articles' | 'pins' | 'questions' = 'answers';
  if (type === 'answer') appType = 'answers';
  else if (type === 'article') appType = 'articles';
  else if (type === 'pin') appType = 'pins';
  else if (type === 'question') appType = 'questions';

  return {
    id: target.id?.toString() || Math.random().toString(),
    title: target.question?.title || target.title || '',
    questionId:
      target.question?.id?.toString() ||
      (type === 'question' ? target.id?.toString() : ''),
    actionText: item.action_text,
    author: {
      id: target.author?.id || '',
      url_token: target.author?.url_token || '',
      name: target.author?.name || '匿名用户',
      avatar:
        target.author?.avatar_url ||
        'https://picx.zhimg.com/v2-abed1a8c04700ba7d72b45195223e0ff_l.jpg',
    },
    excerpt: target.excerpt || target.content?.[0]?.content || '',
    image:
      target.thumbnail ||
      (target.content_img?.length > 0 ? target.content_img[0] : null),
    voteCount: target.voteup_count || target.like_count || 0,
    commentCount: target.comment_count || 0,
    voted: target.relationship?.voting || 0,
    type: appType,
    topics: target.topics?.map((t: any) => ({ id: t.id, name: t.name })) || [],
  };
}

function parseRecommendData(item: any) {
  const target = item.target || item;
  const type = target.type;
  let appType: 'answers' | 'articles' | 'pins' | 'questions' = 'answers';
  if (type === 'answer') appType = 'answers';
  else if (type === 'article') appType = 'articles';
  else if (type === 'pin') appType = 'pins';
  else if (type === 'question') appType = 'questions';

  return {
    id: target.id?.toString() || Math.random().toString(),
    title: target.question?.title || target.title || '',
    questionId:
      target.question?.id?.toString() ||
      (type === 'question' ? target.id?.toString() : ''),
    author: {
      id: target.author?.id || '',
      name: target.author?.name || '匿名用户',
      avatar:
        target.author?.avatar_url ||
        'https://picx.zhimg.com/v2-abed1a8c04700ba7d72b45195223e0ff_l.jpg',
      headline: target.author?.headline || '',
    },
    excerpt: target.excerpt || target.content?.[0]?.content || '',
    image:
      target.thumbnail ||
      (target.content_img?.length > 0 ? target.content_img[0] : null),
    voteCount: target.voteup_count || target.like_count || 0,
    commentCount: target.comment_count || 0,
    voted: target.relationship?.voting || 0,
    type: appType,
    topics: target.topics?.map((t: any) => ({ id: t.id, name: t.name })) || [],
  };
}

function parseHotData(item: any, index: number) {
  const target = item.target || item;
  const questionId = target.url.split('/').pop();
  return {
    id: target.id?.toString() || Math.random().toString(),
    questionId: questionId,
    rank: index + 1,
    title: target.title || '无标题',
    excerpt: target.excerpt || '',
    image: item.children?.[0]?.thumbnail || item.image_url || null,
    hotValue: target.detail_text || '',
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pager: { flex: 1 },
  topNavContainer: { position: 'absolute', left: 16, right: 16, zIndex: 100 },
  blurWrapper: {
    borderRadius: 25,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: 50,
  },
  navItem: {
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  navText: { fontSize: 15 },
  topPill: {
    position: 'absolute',
    width: 54,
    height: 34,
    borderRadius: 17,
    left: 0,
  },
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  bottomBarContainer: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 1001,
  },
  bottomBlur: { borderRadius: 32, overflow: 'hidden', height: 64 },
  bottomNavItems: {
    flexDirection: 'row',
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  bottomTabItem: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomIndicator: {
    position: 'absolute',
    width: (SCREEN_WIDTH - 40) / 3 - 20,
    height: 44,
    borderRadius: 22,
    left: 10,
  },

  loginPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 100,
  },
  loginText: { fontSize: 16, marginTop: 20, marginBottom: 30 },
  loginBtn: { paddingHorizontal: 40, paddingVertical: 12, borderRadius: 25 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
