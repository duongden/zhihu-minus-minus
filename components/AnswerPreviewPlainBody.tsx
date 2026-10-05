import { View } from 'react-native';
import type { ZhihuPlainPreviewAnswer } from '@/api/zhihu/nextRender';
import { Text } from '@/components/Themed';
import { ZhihuContent } from '@/features/rich-content';

export interface AnswerPreviewPlainBodyProps {
  item: ZhihuPlainPreviewAnswer;
  scope: string;
  onRefresh: () => void;
}

/** The selected card always shows its complete available body and interaction. */
export function AnswerPreviewPlainBody({
  item,
  scope,
  onRefresh,
}: AnswerPreviewPlainBodyProps) {
  const html = typeof item.content === 'string' ? item.content : undefined;
  const contentArray =
    typeof item.content === 'string' ? undefined : item.content;
  const incomplete =
    item.contentNeedTruncated || item.answerType?.toUpperCase() === 'PAID';

  return (
    <View>
      <View testID="answer-preview-plain-body">
        <ZhihuContent
          key={`${scope}:${item.id}`}
          content={html}
          contentArray={contentArray}
          objectId={item.id}
          type="answer"
          segmentInfos={item.segmentInfos}
          linkCardInfo={item.linkCardInfo}
          selectable
          onRefresh={onRefresh}
        />
      </View>
      {incomplete ? (
        <Text type="secondary" className="text-xs mt-2">
          当前仅展示部分正文
        </Text>
      ) : null}
    </View>
  );
}
