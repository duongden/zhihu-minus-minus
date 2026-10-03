import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRuntimeThemeColors } from '@/components/Themed';
import type { ZhihuStructuredContent as ZhihuStructuredContentData } from '@/types/zhihu';
import type {
  ZhihuBlock,
  ZhihuFormula,
  ZhihuImageResource,
  ZhihuInlineRun,
} from '../document';
import { normalizeZhihuStructuredContent } from '../structuredContent';
import { ZhihuNativeContent } from './ZhihuNativeContent';

export interface ZhihuStructuredContentProps {
  content: ZhihuStructuredContentData;
  documentId: string;
  renderer: 'blocks' | 'native-v2';
  /** Preview actual source segments; expanding never mutates their text or marks. */
  previewSegmentCount?: number;
  resources?: Readonly<Record<string, ZhihuImageResource>>;
  onLinkPress?: (url: string) => void;
  selectable?: boolean;
}

interface InlineFormulaProps {
  formula: ZhihuFormula;
  color: string;
  width: number;
  selectable: boolean;
}

function InlineFormula({
  formula,
  color,
  width,
  selectable,
}: InlineFormulaProps) {
  const image = formula.image;
  const uri = image?.offlineUri ?? image?.url;
  const [failedUri, setFailedUri] = useState<string | undefined>();
  if (!uri || failedUri === uri)
    return (
      <Text selectable={selectable} style={{ color }}>
        {formula.latex || '[公式]'}
      </Text>
    );
  const rawWidth = image?.width && image.width > 0 ? image.width : 50;
  const rawHeight = image?.height && image.height > 0 ? image.height : 24;
  const scale = Math.min(1, width / rawWidth);
  return (
    <Image
      source={{ uri }}
      accessibilityLabel={formula.latex || '公式'}
      resizeMode="contain"
      style={{ width: rawWidth * scale, height: rawHeight * scale }}
      onError={() => setFailedUri(uri)}
    />
  );
}

/** Isolated JSON renderer for development cases; it has no business mutations. */
export const ZhihuStructuredContent = React.memo(
  function ZhihuStructuredContent({
    content,
    documentId,
    renderer,
    previewSegmentCount = 3,
    resources,
    onLinkPress,
    selectable = true,
  }: ZhihuStructuredContentProps) {
    const colors = useRuntimeThemeColors();
    const dimensions = useWindowDimensions();
    const [width, setWidth] = useState(Math.max(1, dimensions.width - 32));
    const [expandedDocument, setExpandedDocument] = useState<string | null>(
      null,
    );
    const isExpanded = expandedDocument === documentId;
    const previewCount = Number.isSafeInteger(previewSegmentCount)
      ? Math.max(1, previewSegmentCount)
      : 3;
    const visibleContent = useMemo(
      () => ({
        ...content,
        segments: isExpanded
          ? content.segments
          : content.segments.slice(0, previewCount),
      }),
      [content, isExpanded, previewCount],
    );
    const document = useMemo(
      () =>
        normalizeZhihuStructuredContent(visibleContent, {
          documentId,
          resources,
        }),
      [visibleContent, documentId, resources],
    );
    const textStyle: TextStyle = {
      color: colors.text,
      fontSize: 17,
      lineHeight: 25.5,
    };

    function inline(runs: readonly ZhihuInlineRun[]): React.ReactNode {
      return runs.map((run) => {
        switch (run.type) {
          case 'text':
            return <Text key={run.id}>{run.text}</Text>;
          case 'strong':
            return (
              <Text key={run.id} style={{ fontWeight: '700' }}>
                {inline(run.children)}
              </Text>
            );
          case 'link':
            return (
              <Text
                key={run.id}
                accessibilityRole="link"
                style={{ color: colors.link }}
                onPress={onLinkPress ? () => onLinkPress(run.url) : undefined}
              >
                {inline(run.children)}
              </Text>
            );
          case 'inlineFormula':
            return (
              <InlineFormula
                key={run.id}
                formula={run.formula}
                color={colors.text}
                width={width}
                selectable={selectable}
              />
            );
          case 'lineBreak':
            return <Text key={run.id}>{'\n'}</Text>;
          case 'unsupported':
            return <Text key={run.id}>{run.fallbackText}</Text>;
          default:
            return 'children' in run ? (
              <Text key={run.id}>{inline(run.children)}</Text>
            ) : (
              <Text key={run.id}>[暂不支持的行内内容]</Text>
            );
        }
      });
    }

    function blocks(items: readonly ZhihuBlock[]): React.ReactNode {
      return items.map((block) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <Text
                key={block.id}
                selectable={selectable}
                style={[textStyle, { marginBottom: 12 }]}
              >
                {inline(block.children)}
              </Text>
            );
          case 'heading':
            return (
              <Text
                key={block.id}
                selectable={selectable}
                style={[
                  textStyle,
                  {
                    fontSize: 26 - block.level * 2,
                    fontWeight: '700',
                    marginBottom: 12,
                  },
                ]}
              >
                {inline(block.children)}
              </Text>
            );
          case 'list':
            return (
              <View key={block.id} style={{ marginBottom: 12 }}>
                {block.items.map((item, index) => (
                  <View key={item.id} style={{ flexDirection: 'row' }}>
                    <Text style={[textStyle, { width: 24 }]}>
                      {block.ordered ? `${(block.start ?? 1) + index}.` : '•'}
                    </Text>
                    <View style={{ flex: 1 }}>{blocks(item.blocks)}</View>
                  </View>
                ))}
              </View>
            );
          case 'image': {
            const rawWidth =
              block.resource.width && block.resource.width > 0
                ? block.resource.width
                : width;
            const rawHeight =
              block.resource.height && block.resource.height > 0
                ? block.resource.height
                : 120;
            const imageWidth =
              block.layout === 'small'
                ? Math.min(width, block.resource.width ?? width / 2)
                : width;
            return (
              <View key={block.id} style={{ marginBottom: 12 }}>
                <Image
                  source={{
                    uri: block.resource.offlineUri ?? block.resource.url,
                  }}
                  accessibilityLabel={block.alt || '正文图片'}
                  resizeMode="contain"
                  style={{
                    width: imageWidth,
                    height: rawHeight * (imageWidth / rawWidth),
                  }}
                />
                {block.caption?.length ? (
                  <Text
                    selectable={selectable}
                    style={[textStyle, { color: colors.textSecondary }]}
                  >
                    {inline(block.caption)}
                  </Text>
                ) : null}
              </View>
            );
          }
          case 'divider':
            return (
              <View
                key={block.id}
                style={{
                  height: 1,
                  marginVertical: 12,
                  backgroundColor: colors.border,
                }}
              />
            );
          case 'blockFormula':
            return (
              <Text
                key={block.id}
                selectable={selectable}
                style={[textStyle, { marginBottom: 12 }]}
              >
                <InlineFormula
                  formula={block.formula}
                  color={colors.text}
                  width={width}
                  selectable={selectable}
                />
              </Text>
            );
          case 'unsupported':
            return (
              <Text
                key={block.id}
                selectable={selectable}
                style={[textStyle, { marginBottom: 12 }]}
              >
                {block.fallbackText || '[暂不支持的分段]'}
              </Text>
            );
          default:
            return (
              <Text key={block.id} selectable={selectable} style={textStyle}>
                [暂不支持的分段]
              </Text>
            );
        }
      });
    }

    const renderBlocks = () => (
      <View testID="structured-content-blocks">{blocks(document.blocks)}</View>
    );
    const renderFallback = () => (
      <View>
        <Text style={{ color: colors.textSecondary, marginBottom: 12 }}>
          当前客户端未包含原生文本模块，使用 JSON 分段展示
        </Text>
        {renderBlocks()}
      </View>
    );

    return (
      <View
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (Number.isFinite(nextWidth) && nextWidth > 0) setWidth(nextWidth);
        }}
      >
        {renderer === 'native-v2' ? (
          <View testID="structured-content-native">
            <ZhihuNativeContent
              content=""
              document={document}
              objectId={documentId}
              type="answer"
              selectable={selectable}
              onLinkPress={onLinkPress}
              renderFallback={renderFallback}
            />
          </View>
        ) : (
          renderBlocks()
        )}
        {content.segments.length > previewCount ? (
          <Pressable
            testID="structured-content-toggle"
            accessibilityRole="button"
            accessibilityState={{ expanded: isExpanded }}
            onPress={() => setExpandedDocument(isExpanded ? null : documentId)}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 8,
              padding: 10,
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <Text style={{ color: colors.onPrimary }}>
              {isExpanded ? '收起分段' : '展开全部分段'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  },
);
