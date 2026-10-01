import { Alert, Share } from 'react-native';

let pendingAppClipboardText: string | null = null;

export const consumeAppClipboardText = (text: string): boolean => {
  const wasCopiedByApp = pendingAppClipboardText === text;
  pendingAppClipboardText = null;
  return wasCopiedByApp;
};

/**
 * Safely copy text to clipboard.
 * Prevents crashes if the native expo-clipboard module is missing.
 */
export const copyToClipboard = async (
  text: string,
  _successMessage: string = '已复制到剪贴板',
) => {
  pendingAppClipboardText = null;

  try {
    // Dynamic require to avoid top-level import crash
    const Clipboard = require('expo-clipboard');
    if (Clipboard && typeof Clipboard.setStringAsync === 'function') {
      await Clipboard.setStringAsync(text);
      pendingAppClipboardText = text;
      // We assume showToast is available or we use Alert
      return true;
    }
    throw new Error('Clipboard module not found');
  } catch {
    console.error('Clipboard error');
    // Fallback: If clipboard fails, we can at least offer to share the text
    Alert.alert('复制失败', '无法访问剪贴板喵。是否改为通过系统分享发送？', [
      { text: '取消', style: 'cancel' },
      {
        text: '系统分享',
        onPress: () => Share.share({ message: text }),
      },
    ]);
    return false;
  }
};
