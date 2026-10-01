import { useQueryClient } from '@tanstack/react-query';
import React, { useRef, useState } from 'react';
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
} from '@/api/zhihu/voters';
import { colors } from '@/constants/designTokens';
import { updateContentInteractionCaches } from '@/utils/contentCache';
import { showToast } from '@/utils/toast';
import { getZhihuErrorMessage } from '@/utils/zhihuError';
import { BouncyButton } from './BouncyButton';
import { useThemeColor } from './Themed';
import { useColorScheme } from './useColorScheme';
import { VoteTriangle } from './VoteTriangle';

export const DownvoteButton = ({
  id,
  voted: initialVoted = 0,
  type = 'answers',
  variant = 'default',
}: {
  id: string | number;
  voted?: number;
  type?: VoteContentType;
  variant?: 'default' | 'minimal';
}) => {
  const [voted, setVoted] = useState(initialVoted);
  const identity = `${type}:${id}`;
  const currentIdentityRef = useRef(identity);
  currentIdentityRef.current = identity;
  const pendingTargetsRef = useRef(new Set<string>());
  const [pendingIdentity, setPendingIdentity] = useState<string | null>(null);
  const loading = pendingIdentity === identity;
  const queryClient = useQueryClient();
  const scale = useSharedValue(1);
  const colorScheme = useColorScheme();
  const tintColor = useThemeColor({}, 'primary');

  // biome-ignore lint/correctness/useExhaustiveDependencies: FlashList identity changes must reset local reaction state even when the next item has equal initial values.
  React.useEffect(() => {
    setVoted(initialVoted);
  }, [identity, initialVoted]);

  const isDownvoted = voted === -1;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = async () => {
    if (pendingTargetsRef.current.has(identity)) return;
    pendingTargetsRef.current.add(identity);

    scale.value = withSequence(
      withTiming(0.8, { duration: 100 }),
      withSpring(1),
    );

    const nextVoted = isDownvoted ? 0 : -1;

    setPendingIdentity(identity);
    try {
      const voteType = nextVoted === -1 ? 'down' : 'neutral';
      const result = await voteContent(id, type, voteType);
      if (currentIdentityRef.current === identity) setVoted(result.voted);
      if (type !== 'comments') {
        updateContentInteractionCaches(queryClient, {
          type,
          id,
          voted: result.voted,
          voteCount: result.voteCount,
        });
      }
      showToast(getVoteSuccessMessage(type, voted, result.voted));
    } catch (err) {
      showToast(getZhihuErrorMessage(err));
    } finally {
      pendingTargetsRef.current.delete(identity);
      setPendingIdentity((current) => (current === identity ? null : current));
    }
  };

  return (
    <BouncyButton
      accessibilityRole="button"
      accessibilityState={{ busy: loading, selected: isDownvoted }}
      onPress={handlePress}
      disabled={loading}
      className={
        variant === 'default'
          ? 'w-9 h-9 rounded-lg justify-center items-center '
          : 'flex-row items-center justify-center bg-transparent p-2'
      }
      style={[
        variant === 'default' && {
          backgroundColor: isDownvoted ? tintColor : `${tintColor}1a`,
        },
        variant === 'minimal' && { borderRadius: 99 },
        loading && { opacity: 0.7 },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            isDownvoted || variant === 'minimal'
              ? tintColor
              : variant === 'default'
                ? colors[colorScheme].textInverse
                : tintColor
          }
        />
      ) : (
        <Animated.View style={animatedStyle}>
          <VoteTriangle
            active={isDownvoted}
            color={
              variant === 'minimal'
                ? isDownvoted
                  ? tintColor
                  : colors[colorScheme].iconMuted
                : isDownvoted
                  ? colors[colorScheme].textInverse
                  : tintColor
            }
            direction="down"
            size={variant === 'minimal' ? 24 : 20}
          />
        </Animated.View>
      )}
    </BouncyButton>
  );
};
