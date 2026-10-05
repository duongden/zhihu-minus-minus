import { useMemo } from 'react';
import { View } from 'react-native';
import type { ZhihuPlainPreviewAnswer } from '@/api/zhihu/nextRender';
import { ContentActionButton } from '@/components/ContentActionButton';
import { Text, useRuntimeThemeColors } from '@/components/Themed';
import { normalizeZhihuDocument, ZhihuContent } from '@/features/rich-content';

export interface AnswerPreviewPlainBodyProps {
  item: ZhihuPlainPreviewAnswer;
  scope: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onRefresh: () => void;
}

/** The selected card keeps its list HTML; only expanded bodies allow interaction. */
export function AnswerPreviewPlainBody({
  item,
  scope,
  expanded,
  onExpandedChange,
  onRefresh,
}: AnswerPreviewPlainBodyProps) {
  const colors = useRuntimeThemeColors();
  const html = typeof item.content === 'string' ? item.content : undefined;
  const contentArray =
    typeof item.content === 'string' ? undefined : item.content;
  const completeDocument = useMemo(
    () =>
      html === undefined
        ? undefined
        : normalizeZhihuDocument(html, {
            documentId: `answer:${item.id}`,
            linkCardInfo: item.linkCardInfo,
          }).document,
    [html, item.id, item.linkCardInfo],
  );
  const previewDocument = useMemo(
    () =>
      completeDocument
        ? {
            ...completeDocument,
            blocks: completeDocument.blocks.slice(0, 3),
            // Footnote definitions are rendered after the body by WebView.
            footnotes: [],
          }
        : undefined,
    [completeDocument],
  );
  const previewArray = useMemo(() => contentArray?.slice(0, 3), [contentArray]);
  const hasBody = Boolean(
    completeDocument?.blocks.length || contentArray?.length,
  );
  const incomplete =
    item.contentNeedTruncated || item.answerType?.toUpperCase() === 'PAID';

  return (
    <View>
      <View
        testID="answer-preview-plain-body"
        pointerEvents={expanded ? 'auto' : 'none'}
      >
        <ZhihuContent
          key={`${scope}:${item.id}:${expanded ? 'full' : 'preview'}`}
          content={expanded ? html : undefined}
          contentArray={expanded ? contentArray : previewArray}
          document={expanded ? undefined : previewDocument}
          objectId={item.id}
          type="answer"
          segmentInfos={expanded ? item.segmentInfos : undefined}
          linkCardInfo={item.linkCardInfo}
          selectable={expanded}
          onRefresh={expanded ? onRefresh : undefined}
        />
      </View>
      {incomplete ? (
        <Text type="secondary" className="text-xs mt-2">
          当前仅展示部分正文
        </Text>
      ) : null}
      {hasBody || expanded ? (
        <ContentActionButton
          testID="answer-preview-plain-toggle"
          accessibilityState={{ expanded }}
          hitSlop={8}
          onPress={() => onExpandedChange(!expanded)}
          style={{
            alignSelf: 'flex-end',
            backgroundColor: 'transparent',
            paddingVertical: 6,
            paddingHorizontal: 2,
            marginTop: 4,
          }}
        >
          <Text style={{ color: colors.link, fontSize: 13 }}>
            {expanded ? '收起回答' : '展开回答'}
          </Text>
        </ContentActionButton>
      ) : null}
    </View>
  );
}
