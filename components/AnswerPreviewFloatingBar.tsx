import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { ZhihuPreviewAnswer } from '@/api/zhihu/nextRender';
import { ContentActionBar } from '@/components/ContentActionBar';
import { ContentActionButton } from '@/components/ContentActionButton';
import { LikeButton } from '@/components/LikeButton';
import { MoreActionsButton } from '@/components/MoreActionsButton';
import { Text, useRuntimeThemeColors, View } from '@/components/Themed';

export const FLOATING_BAR_HEIGHT = 54;

interface AnswerPreviewFloatingBarProps {
  answer: ZhihuPreviewAnswer | null;
  visible: boolean;
  bottomInset: number;
  onCollapse: (answerId: string) => void;
  onMore: (answer: ZhihuPreviewAnswer) => void;
}

export function AnswerPreviewFloatingBar({
  answer,
  visible,
  bottomInset,
  onCollapse,
  onMore,
}: AnswerPreviewFloatingBarProps) {
  const router = useRouter();
  const colors = useRuntimeThemeColors();
  const shown = visible && answer !== null;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(shown ? 1 : 0, { duration: 220 });
  }, [progress, shown]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 100 }],
  }));

  return (
    <ContentActionBar
      bottom={bottomInset}
      height={FLOATING_BAR_HEIGHT}
      visible={shown}
      style={animatedStyle}
    >
      {answer ? (
        <View style={styles.row}>
          <LikeButton
            id={answer.id}
            count={answer.voteup_count}
            voted={answer.relationship.voting}
            type="answers"
            variant="ghost"
          />
          <ContentActionButton
            accessibilityRole="button"
            accessibilityLabel={`${answer.comment_count} 条回答评论`}
            style={styles.action}
            onPress={() => {
              if (!shown) return;
              router.push({
                pathname: '/comments/[id]',
                params: {
                  id: answer.id,
                  type: 'answer',
                  count: answer.comment_count,
                },
              });
            }}
          >
            <Ionicons
              name="chatbubble-outline"
              size={20}
              color={colors.textSecondary}
            />
            <Text type="secondary" style={styles.label}>
              {answer.comment_count}
            </Text>
          </ContentActionButton>
          <ContentActionButton
            accessibilityRole="button"
            accessibilityLabel="收起当前回答"
            style={styles.action}
            onPress={() => {
              if (shown) onCollapse(answer.id);
            }}
          >
            <Ionicons
              name="chevron-up-circle-outline"
              size={20}
              color={colors.link}
            />
            <Text style={[styles.label, { color: colors.link }]}>收起</Text>
          </ContentActionButton>
          <MoreActionsButton
            accessibilityLabel="回答更多操作"
            style={styles.more}
            onPress={() => {
              if (shown) onMore(answer);
            }}
          />
        </View>
      ) : null}
    </ContentActionBar>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    backgroundColor: 'transparent',
  },
  action: { gap: 4 },
  label: { fontSize: 13, lineHeight: 20, fontWeight: '600' },
  more: { marginLeft: 'auto' },
});
