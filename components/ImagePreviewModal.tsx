import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import ImageViewer from 'react-native-image-zoom-viewer';
import { Text } from '@/components/Themed';
import { saveImageToGallery, shareImage } from '@/utils/saveImage';

export interface ImagePreviewModalProps {
  visible: boolean;
  imageUrls: string[];
  initialIndex?: number;
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  visible,
  imageUrls,
  initialIndex = 0,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // 同步 initialIndex 更改
  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  const formattedUrls = React.useMemo(() => {
    return imageUrls.map((url) => ({ url }));
  }, [imageUrls]);

  const currentUrl = imageUrls[currentIndex] || imageUrls[0];

  const handleShowMenu = useCallback(
    (url?: string) => {
      const targetUrl = url || currentUrl;
      if (!targetUrl) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const options = ['保存到相册', '分享图片', '取消'];
      const cancelButtonIndex = 2;

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            cancelButtonIndex,
          },
          async (buttonIndex) => {
            if (buttonIndex === 0) {
              await saveImageToGallery(targetUrl);
            } else if (buttonIndex === 1) {
              await shareImage(targetUrl);
            }
          },
        );
      } else {
        Alert.alert('图片操作', undefined, [
          {
            text: '保存到相册',
            onPress: () => saveImageToGallery(targetUrl),
          },
          {
            text: '分享图片',
            onPress: () => shareImage(targetUrl),
          },
          {
            text: '取消',
            style: 'cancel',
          },
        ]);
      }
    },
    [currentUrl],
  );

  if (!visible || imageUrls.length === 0) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <ImageViewer
          imageUrls={formattedUrls}
          index={currentIndex}
          onChange={(index) => index != null && setCurrentIndex(index)}
          onCancel={onClose}
          onClick={onClose}
          enableSwipeDown={true}
          onSwipeDown={onClose}
          onLongPress={(image) => handleShowMenu(image?.url)}
          saveToLocalByLongPress={false}
          renderIndicator={() => <></>}
        />

        {/* 顶栏控制条 */}
        <SafeAreaView style={styles.headerSafeArea} pointerEvents="box-none">
          <View style={styles.headerBar}>
            <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </Pressable>

            {imageUrls.length > 1 && (
              <Text style={styles.pageIndicator}>
                {currentIndex + 1} / {imageUrls.length}
              </Text>
            )}

            <View style={styles.rightActions}>
              <Pressable
                onPress={() => shareImage(currentUrl)}
                style={styles.iconBtn}
                hitSlop={12}
              >
                <Ionicons name="share-outline" size={22} color="#FFFFFF" />
              </Pressable>
              <Pressable
                onPress={() => saveImageToGallery(currentUrl)}
                style={styles.iconBtn}
                hitSlop={12}
              >
                <Ionicons name="download-outline" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerSafeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageIndicator: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
