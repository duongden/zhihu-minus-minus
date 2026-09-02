import { ActionSheet } from '@/components/overlays/ActionSheet';
import { copyToClipboard } from '@/utils/clipboard';
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
  const commentText = htmlContent ? extractCommentText(htmlContent) : '';
  if (!htmlContent || !authorName || !commentText) return null;

  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title={`@${authorName} 的评论`}
      subtitle={commentText}
      options={[
        {
          key: 'copy',
          label: '复制评论',
          icon: 'copy-outline',
          onPress: async () => {
            const copied = await copyToClipboard(commentText);
            if (copied) showToast(`已复制 @${authorName} 的评论`);
          },
        },
      ]}
    />
  );
}
