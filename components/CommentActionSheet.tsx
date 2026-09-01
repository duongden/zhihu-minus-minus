import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  View as RNView,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { copyToClipboard } from '@/utils/clipboard';
import { ImpactFeedbackStyle, impactAsync } from '@/utils/haptics';
import { showToast } from '@/utils/toast';

interface CommentActionSheetProps {
  visible: boolean;
  htmlContent: string | null;
  authorName: string | null;
  onClose: () => void;
}

function extractCommentText(htmlContent: string): string {
  const imageRegex =
    /<a[^>]+class="comment_img"[^>]*href="([^"]+)"[^>]*>.*?<\/a>|<a[^>]+href="([^"]+)"[^>]*class="comment_img"[^>]*>.*?<\/a>/gi;

  return htmlContent
    .replace(imageRegex, '[图片]')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function CommentActionSheet({
  visible,
  htmlContent,
  authorName,
  onClose,
}: CommentActionSheetProps) {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const commentText = htmlContent ? extractCommentText(htmlContent) : '';

  useEffect(() => {
    if (visible) {
      void impactAsync(ImpactFeedbackStyle.Medium);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 25,
          stiffness: 250,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim, visible]);

  if (!visible || !htmlContent || !authorName || !commentText) return null;

  const cardBackground = Colors[colorScheme].surface;
  const itemBackground = Colors[colorScheme].backgroundTertiary;
  const textColor = Colors[colorScheme].text;

  const handleCopy = async () => {
    onClose();
    const copied = await copyToClipboard(commentText);
    if (copied) showToast(`已复制 @${authorName} 的评论`);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end bg-transparent">
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: Colors[colorScheme].blackTransparent,
                opacity: fadeAnim,
              },
            ]}
          />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: cardBackground,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <RNView className="items-center pt-2 pb-1">
            <RNView
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colorScheme === 'dark' ? '#48484A' : '#D1D1D6',
              }}
            />
          </RNView>

          <RNView className="flex-row items-center px-4 py-3">
            <RNView className="flex-1 pr-3">
              <Text
                className="text-base font-bold"
                style={{ color: textColor }}
              >
                @{authorName} 的评论
              </Text>
              <Text type="secondary" className="text-sm mt-1" numberOfLines={3}>
                {commentText}
              </Text>
            </RNView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="关闭评论操作"
              onPress={onClose}
              className="p-2 rounded-full"
              style={{ backgroundColor: itemBackground }}
              hitSlop={8}
            >
              <Ionicons
                name="close"
                size={18}
                color={Colors[colorScheme].textSecondary}
              />
            </Pressable>
          </RNView>

          <RNView className="px-4 pt-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="复制评论"
              onPress={() => void handleCopy()}
              className="flex-row items-center p-3.5 rounded-2xl"
              style={{ backgroundColor: itemBackground }}
            >
              <RNView
                className="w-9 h-9 rounded-xl justify-center items-center mr-3"
                style={{ backgroundColor: `${Colors[colorScheme].primary}1A` }}
              >
                <Ionicons
                  name="copy-outline"
                  size={20}
                  color={Colors[colorScheme].primary}
                />
              </RNView>
              <Text
                className="text-base font-semibold"
                style={{ color: textColor }}
              >
                复制评论
              </Text>
            </Pressable>
          </RNView>

          <RNView className="px-4 mt-3">
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              className="py-3.5 items-center rounded-2xl"
              style={{ backgroundColor: itemBackground }}
            >
              <Text type="secondary" className="text-base font-semibold">
                取消
              </Text>
            </Pressable>
          </RNView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 16,
  },
});
