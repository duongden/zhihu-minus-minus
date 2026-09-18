import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  getVoteSuccessMessage,
  type VoteContentType,
  voteContent,
} from '@/api/zhihu';
import Colors from '@/constants/Colors';
import { colors } from '@/constants/designTokens';
import { updateContentInteractionCaches } from '@/utils/contentCache';
import { showToast } from '@/utils/toast';
import { getZhihuErrorMessage } from '@/utils/zhihuError';
import { BouncyButton } from './BouncyButton';
import { Text, useThemeColor } from './Themed';
import { useColorScheme } from './useColorScheme';

export const LikeButton = ({
  id,
  count: initialCount,
  voted: initialVoted = 0,
  type = 'answers',
  variant = 'default',
  onVoteChange,
}: {
  id: string | number;
  count: number | string;
  voted?: number;
  type?: VoteContentType;
  variant?: 'default' | 'ghost' | 'minimal';
  onVoteChange?: (voted: number, count: number) => void;
}) => {
  const [voted, setVoted] = useState(initialVoted);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const scale = useSharedValue(1);
  const colorScheme = useColorScheme();

  const tintColor = useThemeColor({}, 'primary');
  const borderColor = Colors[colorScheme].border;

  // 同步外部传入的初始值
  React.useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);
  React.useEffect(() => {
    setVoted(initialVoted);
  }, [initialVoted]);

  const isUpvoted = voted === 1;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = async () => {
    if (loading) return;

    scale.value = withSequence(
      withTiming(1.4, { duration: 100 }),
      withSpring(1),
    );

    const nextVoted = isUpvoted ? 0 : 1;

    setLoading(true);
    try {
      const voteType =
        type === 'pins'
          ? nextVoted === 1
            ? 'like'
            : 'unlike'
          : nextVoted === 1
            ? 'up'
            : 'neutral';

      const result = await voteContent(id, type, voteType);
      const resolvedCount =
        result.voteCount ??
        (typeof count === 'number'
          ? Math.max(
              0,
              count + Number(result.voted === 1) - Number(voted === 1),
            )
          : undefined);

      setVoted(result.voted);
      // 响应计数优先；接口未返回计数时才按最终状态计算差值。
      if (resolvedCount !== undefined) {
        setCount(resolvedCount);
        onVoteChange?.(result.voted, resolvedCount);

        if (type !== 'comments') {
          updateContentInteractionCaches(queryClient, {
            type,
            id,
            voted: result.voted,
            voteCount: resolvedCount,
          });
        }
      } else if (type !== 'comments') {
        updateContentInteractionCaches(queryClient, {
          type,
          id,
          voted: result.voted,
        });
      }
      showToast(getVoteSuccessMessage(type, voted, result.voted));
    } catch (error: unknown) {
      showToast(getZhihuErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <BouncyButton
      onPress={handlePress}
      disabled={loading}
      className={
        variant === 'default'
          ? 'flex-row items-center px-2 py-1.5 rounded-md'
          : variant === 'ghost'
            ? 'flex-row items-center bg-transparent py-1 px-1 rounded-full'
            : 'flex-row items-center justify-center bg-transparent px-1.5 py-1 rounded-full'
      }
      style={[
        variant === 'default' && {
          backgroundColor: isUpvoted ? tintColor : borderColor,
        },
        (variant === 'ghost' || variant === 'minimal') && {
          borderRadius: 99,
        },
        loading && { opacity: 0.7 },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={tintColor}
          style={{ marginRight: 4 }}
        />
      ) : (
        <Animated.View
          style={[
            animatedStyle,
            { flexDirection: 'row', alignItems: 'center' },
          ]}
        >
          <Ionicons
            name={isUpvoted ? 'caret-up' : 'caret-up-outline'}
            size={variant === 'default' ? 18 : variant === 'minimal' ? 28 : 16}
            color={
              variant === 'minimal'
                ? isUpvoted
                  ? tintColor
                  : colors[colorScheme].iconMuted
                : isUpvoted
                  ? variant === 'default'
                    ? colors[colorScheme].textInverse
                    : tintColor
                  : variant === 'default'
                    ? tintColor
                    : colors[colorScheme].iconMuted
            }
          />
          {variant === 'minimal' && (
            <Text
              className="text-sm ml-0.5 font-bold"
              style={{
                color: isUpvoted ? tintColor : colors[colorScheme].iconMuted,
              }}
            >
              {count}
            </Text>
          )}
        </Animated.View>
      )}
      {variant !== 'minimal' && (
        <Text
          className={`ml-1 text-[13px] font-semibold ${variant === 'ghost' ? 'text-xs ml-0.5' : ''}`}
          style={{
            color: isUpvoted
              ? variant === 'default'
                ? colors[colorScheme].textInverse
                : tintColor
              : variant === 'default'
                ? tintColor
                : colors[colorScheme].iconMuted,
          }}
        >
          {typeof count === 'number' && count > 0
            ? count
            : variant === 'default'
              ? '0 赞同'
              : '0'}
        </Text>
      )}
    </BouncyButton>
  );
};
