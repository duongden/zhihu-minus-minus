import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, Pressable, ScrollView } from 'react-native';
import { fetchRecentMoments } from '@/api/zhihu';
import { Text, View } from './Themed';
import { useColorScheme } from './useColorScheme';
import Colors from '@/constants/Colors';

/**
 * 最近更新的用户头像栏 (朋友圈/动态更新提示)
 */
export function RecentMoments() {
  const router = useRouter();
  const colorScheme = useColorScheme();

  const { data, isLoading } = useQuery({
    queryKey: ['recent-moments'],
    queryFn: fetchRecentMoments,
    // 每 5 分钟自动刷新一次
    refetchInterval: 1000 * 60 * 5,
    // 页面聚焦时刷新
    refetchOnWindowFocus: true,
  });

  // 如果没有数据或数据为空，则不渲染
  if (!data?.data || data.data.length === 0) {
    return null;
  }

  return (
    <View className="bg-transparent border-b-[0.5px] border-black/5 dark:border-white/5">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4 py-4"
      >
        {data.data.map((item) => (
          <Pressable
            key={item.actor.id}
            onPress={() => router.push(`/user/${item.actor.url_token || item.actor.id}`)}
            className="items-center mr-4 w-[64px]"
          >
            <View className="relative mb-1.5 bg-transparent">
              {/* 头像外圈，增加一点仪式感 */}
              <View
                className="p-[2px] rounded-full border-[1.5px]"
                style={{ borderColor: item.unread_count > 0 ? Colors[colorScheme].primary : 'transparent' }}
              >
                <Image
                  source={{ uri: item.actor.avatar_url }}
                  className="w-[52px] h-[52px] rounded-full bg-black/5 dark:bg-white/5"
                />
              </View>

              {/* 未读数字角标 */}
              {item.unread_count > 0 && (
                <View
                  className="absolute -right-1 -top-1 bg-danger rounded-full min-w-[20px] h-[20px] justify-center items-center px-1 border-2 border-white dark:border-[#1a1a1a]"
                  style={{ backgroundColor: Colors[colorScheme].danger }}
                >
                  <Text
                    className="text-white font-bold text-center"
                    style={{
                      fontSize: 10,
                      lineHeight: 12,
                    }}
                  >
                    {item.unread_count > 99 ? '99+' : item.unread_count}
                  </Text>
                </View>
              )}
            </View>

            <Text
              numberOfLines={1}
              className="text-[10px] text-center w-full"
              type={item.unread_count > 0 ? 'default' : 'secondary'}
            >
              {item.actor.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
