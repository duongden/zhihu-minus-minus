import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
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
import { ImpactFeedbackStyle, impactAsync } from '@/utils/haptics';
import { copyImageUrl, saveImageToGallery } from '@/utils/saveImage';

export interface ImageActionBottomSheetProps {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
}

export const ImageActionBottomSheet: React.FC<ImageActionBottomSheetProps> = ({
  visible,
  imageUrl,
  onClose,
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

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
    } else {
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
    }
  }, [visible, fadeAnim, slideAnim]);

  if (!visible || !imageUrl) return null;

  const handleAction = async (action: () => Promise<any>) => {
    onClose();
    setTimeout(async () => {
      await action();
    }, 100);
  };

  const cardBg = isDark ? '#1C1C1E' : '#FFFFFF';
  const itemBg = isDark ? '#2C2C2E' : '#F2F2F7';
  const textColor = Colors[colorScheme].text;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-transparent">
        {/* 背景遮罩 */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                opacity: fadeAnim,
              },
            ]}
          />
        </TouchableWithoutFeedback>

        {/* 底部 Sheet 内容区 */}
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: cardBg,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* 顶部拖拽手柄 */}
          <RNView className="items-center pt-2 pb-1">
            <RNView
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: isDark ? '#48484A' : '#D1D1D6',
              }}
            />
          </RNView>

          {/* 头部信息 */}
          <RNView className="flex-row items-center px-4 py-3 border-b border-gray-200/20">
            <Image
              source={{ uri: imageUrl }}
              className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-800 mr-3"
              resizeMode="cover"
            />
            <RNView className="flex-1">
              <Text
                className="text-base font-bold"
                style={{ color: textColor }}
              >
                图片操作
              </Text>
              <Text
                type="secondary"
                className="text-xs mt-0.5"
                numberOfLines={1}
              >
                {imageUrl}
              </Text>
            </RNView>
            <Pressable
              onPress={onClose}
              className="p-2 rounded-full"
              style={{ backgroundColor: itemBg }}
              hitSlop={8}
            >
              <Ionicons
                name="close"
                size={18}
                color={Colors[colorScheme].textSecondary}
              />
            </Pressable>
          </RNView>

          {/* 菜单列表 */}
          <RNView className="px-4 pt-3 gap-2.5">
            <Pressable
              onPress={() => handleAction(() => saveImageToGallery(imageUrl))}
              className="flex-row items-center p-3.5 rounded-2xl"
              style={{ backgroundColor: itemBg }}
            >
              <RNView
                className="w-9 h-9 rounded-xl justify-center items-center mr-3"
                style={{ backgroundColor: '#34C7591A' }}
              >
                <Ionicons name="download-outline" size={20} color="#34C759" />
              </RNView>
              <Text
                className="text-base font-semibold"
                style={{ color: textColor }}
              >
                保存到系统相册
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleAction(() => copyImageUrl(imageUrl))}
              className="flex-row items-center p-3.5 rounded-2xl"
              style={{ backgroundColor: itemBg }}
            >
              <RNView
                className="w-9 h-9 rounded-xl justify-center items-center mr-3"
                style={{ backgroundColor: '#FF95001A' }}
              >
                <Ionicons name="copy-outline" size={20} color="#FF9500" />
              </RNView>
              <Text
                className="text-base font-semibold"
                style={{ color: textColor }}
              >
                复制图片链接
              </Text>
            </Pressable>
          </RNView>

          {/* 取消按钮 */}
          <RNView className="px-4 mt-3">
            <Pressable
              onPress={onClose}
              className="py-3.5 items-center rounded-2xl"
              style={{ backgroundColor: itemBg }}
            >
              <Text
                className="text-base font-semibold"
                style={{ color: Colors[colorScheme].textSecondary }}
              >
                取消
              </Text>
            </Pressable>
          </RNView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sheetContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 16,
  },
});
