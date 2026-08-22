import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { showToast } from '@/utils/toast';

/**
 * 从网络 URL 或本地 URI 保存图片至手机相册
 */
export async function saveImageToGallery(imageUrl: string): Promise<boolean> {
  try {
    // 触发轻微按压震动反馈
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // 1. 请求相册写入权限
    const { status, granted } = await MediaLibrary.requestPermissionsAsync();
    if (!granted && status !== 'granted') {
      showToast('未获得相册保存权限');
      return false;
    }

    showToast('正在下载保存图片...');

    // 2. 准备本地临时文件路径
    let targetUri = imageUrl;

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      // 提取扩展名或默认为 jpg
      const cleanUrl = imageUrl.split('?')[0];
      let ext = cleanUrl.split('.').pop()?.toLowerCase();
      if (!ext || !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        ext = 'jpg';
      }

      const tempDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      const fileUri = `${tempDir}downloaded_${Date.now()}.${ext}`;

      const downloadRes = await FileSystem.downloadAsync(imageUrl, fileUri);
      if (downloadRes.status !== 200) {
        showToast('图片下载失败，请稍后重试');
        return false;
      }
      targetUri = downloadRes.uri;
    }

    // 3. 保存至手机相册
    await MediaLibrary.saveToLibraryAsync(targetUri);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('图片已保存至系统相册');

    // 4. 清理下载的缓存临时文件
    if (targetUri !== imageUrl && targetUri.startsWith('file://')) {
      FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => {});
    }

    return true;
  } catch (error) {
    console.error('保存图片失败:', error);
    showToast('保存图片失败，请重试');
    return false;
  }
}

/**
 * 分享图片
 */
export async function shareImage(imageUrl: string): Promise<boolean> {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      showToast('当前设备不支持分享功能');
      return false;
    }

    let targetUri = imageUrl;

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const cleanUrl = imageUrl.split('?')[0];
      let ext = cleanUrl.split('.').pop()?.toLowerCase();
      if (!ext || !['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        ext = 'jpg';
      }

      const tempDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      const fileUri = `${tempDir}share_${Date.now()}.${ext}`;

      const downloadRes = await FileSystem.downloadAsync(imageUrl, fileUri);
      if (downloadRes.status !== 200) {
        showToast('图片准备失败，请稍后重试');
        return false;
      }
      targetUri = downloadRes.uri;
    }

    await Sharing.shareAsync(targetUri, {
      dialogTitle: '分享图片',
      mimeType: 'image/*',
    });

    if (targetUri !== imageUrl && targetUri.startsWith('file://')) {
      FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => {});
    }

    return true;
  } catch (error) {
    console.error('分享图片失败:', error);
    showToast('分享图片失败');
    return false;
  }
}
