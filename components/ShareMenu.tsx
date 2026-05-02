import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, Share, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, View } from './Themed';
import { useColorScheme } from './useColorScheme';
import Colors from '@/constants/Colors';
import { MenuOption } from './MenuOption';
import { copyToClipboard } from '@/utils/clipboard';
import { showToast } from '@/utils/toast';

export type ShareContentType = 'answer' | 'question' | 'pin' | 'article';

interface ShareData {
  id: string | number;
  title?: string;
  author?: string;
  authorHeadline?: string;
  content?: string;
  url?: string;
}

interface ShareMenuProps {
  visible: boolean;
  onClose: () => void;
  type: ShareContentType;
  data: ShareData | null;
}

export function ShareMenu({ visible, onClose, type, data }: ShareMenuProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const surfaceColor = Colors[colorScheme].surface;
  const textColor = Colors[colorScheme].text;

  if (!data) return null;

  const getShareLink = () => {
    if (data.url) return data.url;
    switch (type) {
      case 'answer':
        // Note: For answers, we might need a questionId too. 
        // If not provided, we just use the answer ID.
        return `https://www.zhihu.com/answer/${data.id}`;
      case 'question':
        return `https://www.zhihu.com/question/${data.id}`;
      case 'pin':
        return `https://www.zhihu.com/pin/${data.id}`;
      case 'article':
        return `https://zhuanlan.zhihu.com/p/${data.id}`;
      default:
        return '';
    }
  };

  const onNativeShare = async () => {
    try {
      const link = getShareLink();
      await Share.share({
        message: link,
        url: link, // iOS only
        title: data.title || '知乎分享',
      });
      onClose();
    } catch (error) {
      showToast('分享失败');
    }
  };

  const onCopyLink = async () => {
    const link = getShareLink();
    const success = await copyToClipboard(link);
    if (success) {
      showToast('链接已复制');
      onClose();
    }
  };

  const onCopyMarkdown = async () => {
    const link = getShareLink();
    const title = data.title || '';
    const author = data.author || '知乎用户';
    const headline = data.authorHeadline ? `（${data.authorHeadline}）` : '';

    let text = '';
    switch (type) {
      case 'answer':
        text = `### ${title}\n**${author}**${headline} 的回答\n\n${link}`;
        break;
      case 'question':
        text = `### ${title}\n\n${link}`;
        break;
      case 'pin':
        text = `**${author}**${headline} 的想法\n\n${link}`;
        break;
      case 'article':
        text = `### ${title}\n**${author}**${headline} 的文章\n\n${link}`;
        break;
    }

    const success = await copyToClipboard(text);
    if (success) {
      showToast('Markdown 已复制');
      onClose();
    }
  };

  return (
    <>
      {visible && (
        <Modal
          visible={visible}
          transparent
          animationType="fade"
          onRequestClose={onClose}
        >
          <Pressable
            className="flex-1 justify-end bg-black/40"
            onPress={onClose}
          >
            <View
              className="rounded-t-[24px] px-5 pt-2.5"
              style={{
                backgroundColor: surfaceColor,
                paddingBottom: insets.bottom + 20,
              }}
            >
              <View className="items-center py-2.5 bg-transparent">
                <View className="w-10 h-1.5 rounded-[3px] bg-[#ddd]" />
              </View>

              <View className="py-2.5 bg-transparent">
                <View className="flex-row items-center mb-4 px-2.5 bg-transparent">
                  <Text className="text-xl font-bold">更多选项</Text>
                </View>

                <MenuOption
                  icon="share-outline"
                  label="系统分享"
                  onPress={onNativeShare}
                />
                <MenuOption
                  icon="link-outline"
                  label="仅复制链接"
                  onPress={onCopyLink}
                />
                <MenuOption
                  icon="logo-markdown"
                  label="复制链接与信息"
                  onPress={onCopyMarkdown}
                />
                {/* <View className="h-[1px] bg-[rgba(150,150,150,0.1)] my-2.5 mx-2.5" />
                <MenuOption
                  icon="eye-off-outline"
                  label="不感兴趣"
                  onPress={() => {
                    showToast('已记录，将减少此类内容推荐');
                    onClose();
                  }}
                />
                <MenuOption
                  icon="flag-outline"
                  label="举报"
                  onPress={() => {
                    showToast('感谢反馈，我们将尽快处理');
                    onClose();
                  }}
                /> */}
              </View>

              <Pressable
                className="py-[18px] mt-2.5 items-center"
                onPress={onClose}
              >
                <Text className="text-base font-bold">取消</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}
