import { Ionicons } from '@expo/vector-icons';
import CookieManager from '@react-native-cookies/cookies';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
} from 'react-native';
import { getMe, getMember } from '@/api/zhihu';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuthStore } from '@/store/useAuthStore';
import { useThemeStore } from '@/store/useThemeStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useThemeColor } from '@/components/Themed';

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isDark, toggleTheme } = useThemeStore();
  const accentColor = useThemeColor({}, 'primary');
  const surfaceColor = Colors[colorScheme].surface;
  const textColor = Colors[colorScheme].text;
  const {
    cookies,
    setMe,
    accounts,
    activeAccountIndex,
    switchAccount,
    addAccount,
    removeAccount,
    logout,
  } = useAuthStore();

  const [accountModalVisible, setAccountModalVisible] = React.useState(false);

  const {
    data: me,
    isLoading: isMeLoading,
    refetch: refetchMe,
  } = useQuery({
    queryKey: ['me'],
    queryFn: () => getMe(),
    enabled: !!cookies,
  });

  const {
    data: member,
    isLoading: isMemberLoading,
    refetch: refetchMember,
  } = useQuery({
    queryKey: ['me-detail', me?.url_token || me?.id],
    queryFn: () => getMember((me?.url_token || me?.id) as string),
    enabled: !!(me?.url_token || me?.id),
  });

  const profile = member || me;

  React.useEffect(() => {
    if (profile && cookies) {
      addAccount(cookies, profile);
    }
  }, [profile, cookies, addAccount]);

  const isLoading = isMeLoading || isMemberLoading;
  const refetch = () => {
    refetchMe();
    refetchMember();
  };

  const unreadCount =
    (profile?.default_notifications_count || 0) +
    (profile?.follow_notifications_count || 0) +
    (profile?.vote_thank_notifications_count || 0);

  useFocusEffect(
    useCallback(() => {
      if (cookies) refetch();
    }, [cookies, refetch]),
  );

  const handleLogout = () => {
    Alert.alert('退出登录', '确定要退出当前账号吗喵？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定退出',
        style: 'destructive',
        onPress: async () => {
          // If it's the last account, we might want to clear all
          if (accounts.length <= 1) {
            await SecureStore.deleteItemAsync('user_cookies');
            await CookieManager.clearAll();
          }
          logout();
          queryClient.setQueryData(['me'], null);
          if (accounts.length <= 1) {
            router.replace('/login');
          }
        },
      },
    ]);
  };

  const handleSwitchAccount = async (index: number) => {
    if (index === activeAccountIndex) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const targetAccount = accounts[index];

    // Update CookieManager with target account's cookies
    await CookieManager.clearAll();
    const cookiePairs = targetAccount.cookies.split(';');
    for (const pair of cookiePairs) {
      const [name, value] = pair.trim().split('=');
      if (name && value) {
        await CookieManager.set('https://www.zhihu.com', {
          name,
          value,
          domain: '.zhihu.com',
          path: '/',
        });
      }
    }

    switchAccount(index);
    queryClient.clear(); // 核心：彻底清空缓存，防止使用旧账号 ID 和新 Cookie 组合导致的 403
    setAccountModalVisible(false);
  };

  const handleAddAccount = async () => {
    setAccountModalVisible(false);
    // When adding account, we don't clear current store yet,
    // just navigate to login. Login will overwrite cookies.
    await CookieManager.clearAll();
    router.push('/login');
  };

  const onToggleTheme = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleTheme();
  };

  return (
    <ScrollView
      className="flex-1"
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={refetch}
          tintColor={accentColor}
        />
      }
    >
      {/* 顶部用户信息区 */}
      <View type="surface" className="pt-[60px] px-5 pb-5 rounded-b-[24px]">
        {me ? (
          <Pressable
            className="flex-row items-center mb-[25px]"
            onPress={() => router.push(`/user/${me.url_token || me.id}`)}
          >
            <Image
              source={{ uri: me.avatar_url }}
              className="w-16 h-16 rounded-full bg-[#eee]"
            />
            <View className="flex-1 ml-[15px] bg-transparent">
              <Text className="text-[22px] font-bold">{me.name}</Text>
              <Text
                type="secondary"
                className="text-[13px] mt-1"
                numberOfLines={1}
              >
                {me.headline || '点击查看个人主页'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </Pressable>
        ) : (
          <Pressable
            className="flex-row items-center mb-[25px]"
            onPress={() => router.push('/login')}
          >
            <View className="w-16 h-16 rounded-full border border-[#eee] justify-center items-center">
              <Ionicons name="person" size={40} color="#ccc" />
            </View>
            <View className="flex-1 ml-[15px] bg-transparent">
              <Text className="text-[22px] font-bold">点击登录</Text>
              <Text type="secondary" className="text-[13px] mt-1">
                登录后开启更多精彩内容
              </Text>
            </View>
          </Pressable>
        )}

        {/* 数据战绩统计 */}
        <View className="flex-row justify-between px-2.5 bg-transparent">
          <StatItem
            count={profile?.answer_count || 0}
            label="回答"
            onPress={() =>
              profile && router.push(`/user/${profile.url_token || profile.id}`)
            }
          />
          <StatItem
            count={profile?.articles_count || 0}
            label="文章"
            onPress={() =>
              profile && router.push(`/user/${profile.url_token || profile.id}`)
            }
          />
          <StatItem
            count={profile?.following_count || 0}
            label="关注"
            onPress={() =>
              profile &&
              router.push(`/user/${profile.url_token || profile.id}/following`)
            }
          />
          <StatItem
            count={profile?.follower_count || 0}
            label="粉丝"
            onPress={() =>
              profile &&
              router.push(`/user/${profile.url_token || profile.id}/followers`)
            }
          />
        </View>
      </View>

      {/* 我的资产 */}
      <View
        type="surface"
        className="px-4 rounded-2xl mx-3 mt-3 overflow-hidden"
      >
        <MenuItem
          icon="bookmark-outline"
          title="我的收藏"
          color="#ff9800"
          onPress={() => router.push('/collections' as any)}
        />
        <MenuItem
          icon="time-outline"
          title="最近浏览"
          color="#2196f3"
          onPress={() => router.push('/history' as any)}
        />
      </View>

      {/* 通用设置 */}
      <View
        type="surface"
        className="px-4 rounded-2xl mx-3 mt-3 overflow-hidden"
      >
        <View className="flex-row items-center justify-between py-[15px] bg-transparent">
          <View className="flex-row items-center bg-transparent">
            <View
              className="w-9 h-9 rounded-lg justify-center items-center"
              style={{
                backgroundColor: isDark
                  ? 'rgba(255,255,255,0.1)'
                  : 'rgba(0,0,0,0.05)',
              }}
            >
              <Ionicons
                name={isDark ? 'moon' : 'sunny'}
                size={20}
                color={isDark ? '#ffcf40' : '#ff9800'}
              />
            </View>
            <Text className="text-base ml-3 font-medium">夜间模式</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={onToggleTheme}
            trackColor={{ false: '#ddd', true: accentColor }}
            thumbColor="#fff"
          />
        </View>

        <MenuItem
          icon="color-palette-outline"
          title="外观与定制"
          color={accentColor}
          onPress={() => router.push('/settings/appearance' as any)}
        />

        <MenuItem
          icon="notifications-outline"
          title="消息通知"
          onPress={() => router.push('/notifications' as any)}
          right={
            unreadCount > 0 ? (
              <View className="flex-row items-center bg-transparent">
                <Text className="bg-[#ff4d4f] text-white text-xs font-bold px-1.5 py-0.5 rounded-[10px] overflow-hidden mr-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#ccc" />
              </View>
            ) : undefined
          }
        />
        <MenuItem
          icon="people-outline"
          title="切换账号"
          onPress={() => setAccountModalVisible(true)}
          right={
            <View className="flex-row items-center bg-transparent">
              <Text type="secondary" className="mr-1 text-[13px]">
                {accounts.length} 个账号
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#ccc" />
            </View>
          }
        />
        <MenuItem
          icon="help-circle-outline"
          title="反馈与建议"
          onPress={() => router.push('/feedback')}
        />
      </View>

      {/* 退出登录按钮 */}
      {me && (
        <Pressable
          className="mt-[30px] py-[15px] items-center"
          onPress={handleLogout}
        >
          <Text className="text-[#ff4d4f] text-base font-semibold">
            退出账号
          </Text>
        </Pressable>
      )}

      <View className="h-[100px] bg-transparent" />

      {/* 账号切换 Modal */}
      <Modal
        visible={accountModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAccountModalVisible(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/50"
          onPress={() => setAccountModalVisible(false)}
        >
          <View
            type="surface"
            className="rounded-t-[24px] px-5 pt-3 pb-8"
            style={{ maxHeight: '70%' }}
          >
            <View className="items-center mb-5 bg-transparent">
              <View className="w-10 h-1.5 rounded-full bg-gray-300" />
              <Text className="text-lg font-bold mt-4">切换账号</Text>
            </View>

            <ScrollView className="bg-transparent">
              {accounts.map((account, index) => (
                <Pressable
                  key={account.me?.id || index}
                  onPress={() => handleSwitchAccount(index)}
                  className="flex-row items-center py-4 border-b border-gray-100 dark:border-gray-800 bg-transparent"
                >
                  <Image
                    source={{ uri: account.me?.avatar_url }}
                    className="w-12 h-12 rounded-full bg-[#eee]"
                  />
                  <View className="flex-1 ml-4 bg-transparent">
                    <Text className="text-base font-bold">
                      {account.me?.name}
                    </Text>
                    <Text
                      type="secondary"
                      className="text-xs mt-1"
                      numberOfLines={1}
                    >
                      {account.me?.headline || '知乎用户'}
                    </Text>
                  </View>
                  {index === activeAccountIndex && (
                    <Ionicons name="checkmark-circle" size={24} color="#0084ff" />
                  )}
                </Pressable>
              ))}

              <Pressable
                onPress={handleAddAccount}
                className="flex-row items-center py-5 bg-transparent"
              >
                <View className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 justify-center items-center">
                  <Ionicons name="add" size={28} color="#666" />
                </View>
                <Text className="text-base ml-4 font-medium">添加账号</Text>
              </Pressable>
            </ScrollView>

            <Pressable
              onPress={() => setAccountModalVisible(false)}
              className="mt-4 py-4 items-center bg-gray-100 dark:bg-gray-800 rounded-xl"
            >
              <Text className="text-base font-bold">取消</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function StatItem({ count, label, onPress }: any) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="align-center flex-1 bg-transparent"
    >
      <Text className="text-[18px] font-bold text-center">{count}</Text>
      <Text type="secondary" className="text-xs mt-1 text-center">
        {label}
      </Text>
    </Pressable>
  );
}

function MenuItem({ icon, title, color = '#666', right, onPress }: any) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between py-[15px]"
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      <View className="flex-row items-center bg-transparent">
        <View
          className="w-9 h-9 rounded-lg justify-center items-center"
          style={{ backgroundColor: color + '15' }}
        >
          <Ionicons name={icon} size={20} color={color} />
        </View>
        <Text className="text-base ml-3 font-medium">{title}</Text>
      </View>
      {right ? (
        right
      ) : (
        <Ionicons name="chevron-forward" size={16} color="#ccc" />
      )}
    </Pressable>
  );
}
