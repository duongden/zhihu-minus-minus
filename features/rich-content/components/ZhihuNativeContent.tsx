import * as Clipboard from 'expo-clipboard';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SvgUri } from 'react-native-svg';
import { useThemeColor } from '@/components/Themed';
import {
  isRichTextNativeAvailable,
  RichTextNativeView,
} from '@/modules/zhihu-rich-text';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ZhihuContentSegment, ZhihuSegmentInfo } from '@/types/zhihu';
import {
  compileZhihuDocument,
  getRichTextSelectionText,
  mapRichTextSelection,
} from '../compileRichText';
import type {
  ZhihuBlock,
  ZhihuDocument,
  ZhihuFormula,
  ZhihuInlineRun,
  ZhihuLinkCardBlock,
  ZhihuSegmentHighlightRun,
  ZhihuSegmentRun,
} from '../document';
import {
  getZhihuDocumentPreviewImages,
  walkZhihuDocument,
} from '../documentTraversal';
import { DAILY_AVATAR_SIZE, type RichContentVariant } from '../imagePolicy';
import {
  normalizeZhihuContentSegments,
  normalizeZhihuDocument,
} from '../normalization/normalizeZhihuDocument';
import {
  createRichContentMetrics,
  RICH_CONTENT_PARAGRAPH_SPACING,
  RICH_CONTENT_UNKNOWN_IMAGE_HEIGHT,
} from '../presentation';
import type {
  RichTextDecoration,
  RichTextFlow,
  RichTextSelectionMapping,
} from '../richText';
import type { RichContentObjectType } from '../types';
import { NativeTable } from './NativeTable';

export { isRichTextNativeAvailable } from '@/modules/zhihu-rich-text';

export interface ZhihuNativeTypographyOptions {
  justify?: boolean;
  integerMeasure?: boolean;
  decorations?: boolean;
  decorationKind?: RichTextDecoration['kind'];
}

export interface ZhihuNativeContentSelection {
  flowId: string;
  textVersion: string;
  start: number;
  end: number;
  mapping: RichTextSelectionMapping | null;
}

export interface ZhihuNativeSegmentAction {
  nodeId: string;
  paragraphId?: string;
  start: number;
  end: number;
  text: string;
  segment?: ZhihuSegmentRun | ZhihuSegmentHighlightRun;
}

export interface ZhihuNativeContentProps {
  content: string;
  contentArray?: readonly ZhihuContentSegment[];
  objectId: string;
  type: RichContentObjectType;
  segmentInfos?: readonly ZhihuSegmentInfo[];
  linkCardInfo?: Readonly<Record<string, unknown>>;
  variant?: RichContentVariant;
  selectable?: boolean;
  fontSizeScale?: number;
  lineHeightScale?: number;
  options?: ZhihuNativeTypographyOptions;
  onLinkPress?: (url: string) => void;
  onImagePress?: (url: string, gallery: readonly string[]) => void;
  onImageLongPress?: (url: string) => void;
  onSelectionChange?: (
    selection: ZhihuNativeContentSelection,
    flow: RichTextFlow,
    document: ZhihuDocument,
  ) => void;
  onSegmentPress?: (
    action: ZhihuNativeSegmentAction,
    document: ZhihuDocument,
  ) => void;
  /** Reuse the host's Zhihu metadata and query-backed card behavior. */
  renderLinkCard?: (card: ZhihuLinkCardBlock) => React.ReactNode;
  /** The host supplies its complete RNRH adapter on unsupported clients. */
  renderFallback: () => React.ReactNode;
  /** Keep the host's preview visible until the native layout is measured. */
  renderPlaceholder?: () => React.ReactNode;
  onLayoutReady?: () => void;
}

interface FlowEvent {
  flowId: string;
  textVersion: string;
  start: number;
  end: number;
}

interface ActionEvent extends FlowEvent {
  kind: 'link' | 'segment' | 'attachment' | 'attachmentLongPress';
  id: string;
  url?: string;
}

function eventPayload<T>(event: T & { readonly nativeEvent?: T }): T {
  return event.nativeEvent ?? event;
}

function inlineText(runs: readonly ZhihuInlineRun[]): string {
  return runs
    .map((run) => {
      if ('children' in run) return inlineText(run.children);
      if ('text' in run) return run.text;
      if (run.type === 'lineBreak') return '\n';
      if (run.type === 'inlineFormula') return run.formula.latex || '[公式]';
      if (run.type === 'inlineImage') return run.alt || '[图片]';
      if (run.type === 'footnoteReference') return `[${run.label}]`;
      return run.fallbackText;
    })
    .join('');
}

function blockText(block: ZhihuBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return inlineText(block.children);
    case 'quote':
      return block.blocks.map(blockText).join('\n');
    case 'list':
      return block.items
        .map((item) => item.blocks.map(blockText).join('\n'))
        .join('\n');
    case 'code':
      return block.text;
    case 'unsupported':
      return block.fallbackText;
    case 'image':
      return block.caption ? inlineText(block.caption) : block.alt || '[图片]';
    case 'blockFormula':
      return block.formula.latex || '[公式]';
    case 'video':
      return block.title || '[视频]';
    case 'linkCard':
      return block.title;
    case 'table':
      return block.body
        .map((row) =>
          row.cells
            .map((cell) => cell.blocks.map(blockText).join('\n'))
            .join('\t'),
        )
        .join('\n');
    case 'divider':
      return '';
  }
}

interface FlowViewProps {
  flow: RichTextFlow;
  contentWidth: number;
  configJson: string;
  fontSize: number;
  lineHeight: number;
  selectable: boolean;
  options: ZhihuNativeTypographyOptions;
  linkColor: string;
  onSelection: (event: FlowEvent, flow: RichTextFlow) => void;
  onAction: (event: ActionEvent, flow: RichTextFlow) => void;
  onMeasured?: (flow: RichTextFlow) => void;
}

const measuredFlowHeights = new Map<string, number>();

function flowMeasureKey(
  flow: RichTextFlow,
  width: number,
  configJson: string,
): string {
  return `${flow.id}:${flow.textVersion}:${width}:${configJson}`;
}

/** Paint/actions may change without changing the native text's measured size. */
function flowLayoutIdentity(flow: RichTextFlow): string {
  const metricSpans = flow.spans.filter((span) =>
    ['strong', 'emphasis', 'subscript', 'superscript', 'code'].includes(
      span.kind,
    ),
  );
  const boundaries = [
    ...new Set(metricSpans.flatMap((span) => [span.start, span.end])),
  ].sort((a, b) => a - b);
  const styles: { start: number; end: number; kinds: string[] }[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const kinds = metricSpans
      .filter((span) => span.start <= start && span.end >= end)
      .map((span) => span.kind);
    if (!kinds.length) continue;
    const previous = styles[styles.length - 1];
    // A knowledge mark can split one strong/code run into adjacent identical
    // styled pieces. Preserve effective metric styles rather than those cuts.
    if (previous?.end === start && previous.kinds.join(',') === kinds.join(','))
      previous.end = end;
    else styles.push({ start, end, kinds });
  }
  return JSON.stringify({
    text: flow.text,
    paragraphs: flow.paragraphs.map((paragraph) => ({
      start: paragraph.start,
      end: paragraph.end,
      kind: paragraph.kind,
      level: paragraph.level,
      fontSize: paragraph.fontSize,
      lineHeight: paragraph.lineHeight,
      indent: paragraph.indent,
      marginTop: paragraph.marginTop,
      marginBottom: paragraph.marginBottom,
    })),
    styles,
    attachments: flow.attachments.map((attachment) => ({
      start: attachment.start,
      end: attachment.end,
      kind: attachment.kind,
      url: attachment.url,
      latex: attachment.latex,
      width: attachment.width,
      height: attachment.height,
      baselineOffset: attachment.baselineOffset,
    })),
  });
}

const NativeFlow = React.memo(function NativeFlow({
  flow,
  contentWidth,
  configJson,
  fontSize,
  lineHeight,
  selectable,
  options,
  linkColor,
  onSelection,
  onAction,
  onMeasured,
}: FlowViewProps) {
  const flowJson = useMemo(
    () =>
      JSON.stringify({
        ...flow,
        decorations:
          options.decorations === false
            ? []
            : flow.decorations.map((decoration) => ({
                ...decoration,
                color: decoration.color || linkColor,
                kind: options.decorationKind || decoration.kind,
              })),
      }),
    [flow, linkColor, options.decorationKind, options.decorations],
  );
  const measureKey = flowMeasureKey(flow, contentWidth, configJson);
  const geometryKey = useMemo(
    () => `${contentWidth}:${configJson}:${flowLayoutIdentity(flow)}`,
    [flow, contentWidth, configJson],
  );
  const [measuredHeight, setMeasuredHeight] = useState<{
    key: string;
    geometryKey: string;
    height: number;
    verified: boolean;
  } | null>(() => {
    const height = measuredFlowHeights.get(measureKey);
    return height
      ? { key: measureKey, geometryKey, height, verified: false }
      : null;
  });
  const currentInput = useRef({ flow, measureKey });
  currentInput.current = { flow, measureKey };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const initialHeight =
    Math.ceil(flow.text.length / Math.max(1, contentWidth / fontSize)) *
      lineHeight +
    flow.paragraphs.length * RICH_CONTENT_PARAGRAPH_SPACING;
  const height =
    measuredHeight?.key === measureKey ||
    (measuredHeight?.verified && measuredHeight.geometryKey === geometryKey)
      ? measuredHeight.height
      : initialHeight;

  return (
    <RichTextNativeView
      flowJson={flowJson}
      configJson={configJson}
      contentWidth={contentWidth}
      layoutKey={measureKey}
      selectable={selectable}
      style={{ width: contentWidth, height: Math.max(lineHeight, height) }}
      onHeightChange={(raw) => {
        if (!mounted.current || currentInput.current.measureKey !== measureKey)
          return;
        const event = eventPayload(raw);
        if (
          event.flowId === flow.id &&
          event.textVersion === flow.textVersion &&
          event.layoutKey === measureKey &&
          Number.isFinite(event.height) &&
          event.height > 0
        ) {
          setMeasuredHeight({
            key: measureKey,
            geometryKey,
            height: event.height,
            verified: true,
          });
          if (measuredFlowHeights.size >= 128)
            measuredFlowHeights.delete(
              measuredFlowHeights.keys().next().value || '',
            );
          measuredFlowHeights.set(measureKey, event.height);
          onMeasured?.(flow);
        }
      }}
      onSelectionChange={(raw) => {
        if (mounted.current && currentInput.current.flow === flow)
          onSelection(eventPayload(raw), flow);
      }}
      onAction={(raw) => {
        if (mounted.current && currentInput.current.flow === flow)
          onAction(eventPayload(raw), flow);
      }}
    />
  );
});

function FormulaBlock({
  formula,
  width,
  color,
}: {
  formula: ZhihuFormula;
  width: number;
  color: string;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const image = formula.image;
  const uri = image?.offlineUri || image?.url;
  const height = Math.min(160, image?.height || 56);
  const formulaWidth = Math.min(width, image?.width || width);
  return (
    <ScrollView horizontal contentContainerStyle={styles.formula}>
      {uri && failedUri !== uri ? (
        /(?:svg|\/equation(?:\?|$))/i.test(uri) ? (
          <SvgUri
            uri={uri}
            width={formulaWidth}
            height={height}
            onError={() => setFailedUri(uri)}
          />
        ) : (
          <Image
            source={{ uri }}
            resizeMode="contain"
            style={{ width: formulaWidth, height }}
            onError={() => setFailedUri(uri)}
          />
        )
      ) : (
        <Text selectable style={[styles.formulaFallback, { color }]}>
          {formula.latex || '[公式暂不可显示]'}
        </Text>
      )}
    </ScrollView>
  );
}

interface BlockViewProps {
  block: ZhihuBlock;
  width: number;
  fontSize: number;
  lineHeight: number;
  textColor: string;
  secondaryColor: string;
  linkColor: string;
  surfaceColor: string;
  borderColor: string;
  onLink: (url: string) => void;
  onImage?: (url: string) => void;
  onImageLongPress?: (url: string) => void;
  configJson: string;
  selectable: boolean;
  options: ZhihuNativeTypographyOptions;
  onFlowAction: (event: ActionEvent, flow: RichTextFlow) => void;
  onFlowSelection?: (event: FlowEvent, flow: RichTextFlow) => void;
  renderLinkCard?: (card: ZhihuLinkCardBlock) => React.ReactNode;
  textAlign?: 'left' | 'center' | 'right';
}

function NativeParagraph(props: BlockViewProps) {
  const { block, fontSize, lineHeight } = props;
  const compiled = useMemo(
    () =>
      compileZhihuDocument(
        { id: `${block.id}:nested`, blocks: [block] },
        { fontSize, lineHeight, paragraphSpacing: 0 },
      ),
    [block, fontSize, lineHeight],
  );
  const configJson = useMemo(() => {
    const config: unknown = JSON.parse(props.configJson);
    return JSON.stringify({
      ...(config && typeof config === 'object' ? config : {}),
      fontSize,
      lineHeight,
      textColor: props.textColor,
      textAlign: props.textAlign ?? 'left',
      justify: props.textAlign ? false : (props.options.justify ?? false),
    });
  }, [
    props.configJson,
    props.textColor,
    props.textAlign,
    props.options.justify,
    fontSize,
    lineHeight,
  ]);
  return (
    <View style={{ width: props.width }}>
      {compiled.parts.map((part) =>
        part.type === 'flow' ? (
          <NativeFlow
            key={part.flow.id}
            flow={part.flow}
            contentWidth={props.width}
            configJson={configJson}
            fontSize={fontSize}
            lineHeight={lineHeight}
            selectable={props.selectable}
            options={props.options}
            linkColor={props.linkColor}
            onSelection={(event, flow) => props.onFlowSelection?.(event, flow)}
            onAction={props.onFlowAction}
          />
        ) : null,
      )}
    </View>
  );
}

function NativeBlock(props: BlockViewProps) {
  const {
    block,
    width,
    fontSize,
    lineHeight,
    textColor,
    secondaryColor,
    linkColor,
    surfaceColor,
    borderColor,
    onLink,
    onImage,
    onImageLongPress,
  } = props;
  const [failedImageUri, setFailedImageUri] = useState<string | null>(null);
  const [naturalImageSize, setNaturalImageSize] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const textStyle = { color: textColor, fontSize, lineHeight };
  switch (block.type) {
    case 'image': {
      const uri = block.resource.offlineUri || block.resource.url;
      const dimensions =
        naturalImageSize?.uri === uri ? naturalImageSize : block.resource;
      const aspect =
        dimensions.width && dimensions.height
          ? dimensions.width / dimensions.height
          : null;
      const imageWidth = block.role === 'avatar' ? DAILY_AVATAR_SIZE : width;
      const imageHeight =
        block.role === 'avatar'
          ? DAILY_AVATAR_SIZE
          : aspect
            ? width / aspect
            : RICH_CONTENT_UNKNOWN_IMAGE_HEIGHT;
      return (
        <View style={[styles.block, { width }]}>
          <Pressable
            onPress={() => onImage?.(uri)}
            onLongPress={() => onImageLongPress?.(uri)}
            accessibilityRole="imagebutton"
            accessibilityLabel={block.alt || '正文图片'}
            style={
              block.role === 'avatar'
                ? {
                    width: imageWidth,
                    height: imageHeight,
                    borderRadius: imageWidth / 2,
                    overflow: 'hidden',
                  }
                : undefined
            }
          >
            {failedImageUri === uri ? (
              <View
                style={[
                  styles.imageFallback,
                  { backgroundColor: surfaceColor },
                ]}
              >
                <Text style={{ color: secondaryColor }}>
                  {block.alt || '图片暂不可显示'}
                </Text>
              </View>
            ) : /svg/i.test(uri) ? (
              <SvgUri
                uri={uri}
                width={imageWidth}
                height={imageHeight}
                onError={() => setFailedImageUri(uri)}
              />
            ) : (
              <Image
                source={{ uri }}
                style={{
                  width: imageWidth,
                  height: imageHeight,
                  borderRadius: 8,
                }}
                resizeMode="contain"
                onError={() => setFailedImageUri(uri)}
                onLoad={(event) => {
                  const { width: loadedWidth, height: loadedHeight } =
                    event.nativeEvent.source;
                  if (loadedWidth > 0 && loadedHeight > 0)
                    setNaturalImageSize({
                      uri,
                      width: loadedWidth,
                      height: loadedHeight,
                    });
                }}
              />
            )}
          </Pressable>
          {block.caption ? (
            <NativeParagraph
              {...props}
              fontSize={fontSize * 0.8}
              lineHeight={lineHeight * 0.8}
              textColor={secondaryColor}
              block={{
                id: `${block.id}:caption`,
                type: 'paragraph',
                children: block.caption,
              }}
            />
          ) : null}
        </View>
      );
    }
    case 'blockFormula':
      return block.formula.image ? (
        <View style={[styles.block, { width }]}>
          <NativeParagraph
            {...props}
            textAlign="center"
            block={{
              id: `${block.id}:display`,
              type: 'paragraph',
              children: [
                {
                  id: `${block.id}:attachment`,
                  type: 'inlineFormula',
                  formula: block.formula,
                },
              ],
            }}
          />
        </View>
      ) : (
        <FormulaBlock formula={block.formula} width={width} color={textColor} />
      );
    case 'video':
      return (
        <Pressable
          onPress={() => onLink(block.url)}
          accessibilityRole="button"
          style={[
            styles.mediaCard,
            { borderColor, backgroundColor: surfaceColor },
          ]}
        >
          <View
            style={{
              width: '100%',
              aspectRatio: 16 / 9,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {block.poster ? (
              <Image
                source={{ uri: block.poster.url }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : null}
            <View
              style={{
                backgroundColor: '#00000088',
                borderRadius: 24,
                width: 48,
                height: 48,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#ffffff', fontSize: 22 }}>▶</Text>
            </View>
          </View>
          <Text style={[styles.cardTitle, { color: textColor }]}>
            ▶ {block.title || '视频'}
          </Text>
          <Text style={[styles.caption, { color: linkColor }]}>
            打开{block.resource ? '视频资源' : '视频页面'}
          </Text>
        </Pressable>
      );
    case 'linkCard':
      if (props.renderLinkCard) return props.renderLinkCard(block);
      return (
        <Pressable
          onPress={() => onLink(block.url)}
          accessibilityRole="link"
          style={[
            styles.mediaCard,
            { borderColor, backgroundColor: surfaceColor },
          ]}
        >
          <Text
            numberOfLines={2}
            style={[styles.cardTitle, { color: textColor }]}
          >
            {block.title || block.url}
          </Text>
          {block.description ? (
            <Text style={[styles.caption, { color: secondaryColor }]}>
              {block.description}
            </Text>
          ) : null}
          <Text
            numberOfLines={1}
            style={[styles.caption, { color: linkColor }]}
          >
            {block.url}
          </Text>
          {block.image ? (
            <Image
              source={{ uri: block.image.url }}
              style={{ width: width - 26, height: 120 }}
              resizeMode="cover"
            />
          ) : null}
        </Pressable>
      );
    case 'table':
      return (
        <NativeTable
          block={block}
          width={width}
          borderColor={borderColor}
          surfaceColor={surfaceColor}
          caption={
            block.caption ? (
              <NativeParagraph
                {...props}
                textColor={secondaryColor}
                block={{
                  id: `${block.id}:caption`,
                  type: 'paragraph',
                  children: block.caption,
                }}
              />
            ) : undefined
          }
          renderCell={(cell, contentWidth) =>
            cell.blocks.map((child) => (
              <NativeBlock
                key={child.id}
                {...props}
                width={contentWidth}
                textAlign={
                  cell.alignment && cell.alignment !== 'default'
                    ? cell.alignment
                    : undefined
                }
                block={
                  cell.isHeader && child.type === 'paragraph'
                    ? {
                        ...child,
                        children: [
                          {
                            id: `${child.id}:header`,
                            type: 'strong',
                            children: child.children,
                          },
                        ],
                      }
                    : child
                }
              />
            ))
          }
        />
      );
    case 'code':
      return (
        <ScrollView
          horizontal
          style={[styles.code, { backgroundColor: surfaceColor }]}
        >
          <Text
            selectable
            style={[
              textStyle,
              {
                fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                fontSize: fontSize * 0.82,
              },
            ]}
          >
            {block.text}
          </Text>
        </ScrollView>
      );
    case 'divider':
      return (
        <View style={[styles.divider, { backgroundColor: borderColor }]} />
      );
    case 'quote':
      return (
        <View style={[styles.quote, { borderColor: linkColor }]}>
          {block.blocks.map((child) => (
            <NativeBlock
              key={child.id}
              {...props}
              block={child}
              width={width - 18}
              textColor={secondaryColor}
            />
          ))}
        </View>
      );
    case 'list':
      return (
        <View style={styles.block}>
          {block.items.map((item, index) => (
            <View key={item.id} style={styles.tableRow}>
              <Text style={textStyle}>
                {block.ordered ? `${(block.start || 1) + index}. ` : '• '}
              </Text>
              <View style={{ flex: 1 }}>
                {item.blocks.map((child) => (
                  <NativeBlock
                    key={child.id}
                    {...props}
                    block={child}
                    width={width - 24}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    case 'paragraph':
    case 'heading':
      return <NativeParagraph {...props} />;
    case 'unsupported':
      return (
        <Text selectable style={[textStyle, styles.block]}>
          {block.fallbackText || `[暂不支持的 ${block.sourceType} 内容]`}
        </Text>
      );
  }
}

/** Android V2 prototype: native text flows, React Native media boundaries. */
export const ZhihuNativeContent = React.memo(function ZhihuNativeContent({
  content,
  contentArray,
  objectId,
  type,
  segmentInfos,
  linkCardInfo,
  variant = 'default',
  selectable = true,
  fontSizeScale,
  lineHeightScale,
  options = {},
  onLinkPress,
  onImagePress,
  onImageLongPress,
  onSelectionChange,
  onSegmentPress,
  renderLinkCard,
  renderFallback,
  renderPlaceholder,
  onLayoutReady,
}: ZhihuNativeContentProps) {
  const dimensions = useWindowDimensions();
  const settings = useSettingsStore();
  const textColor = useThemeColor({}, 'text');
  const secondaryColor = useThemeColor({}, 'textSecondary');
  const linkColor = useThemeColor({}, 'primary');
  const surfaceColor = useThemeColor({}, 'backgroundSecondary');
  const borderColor = useThemeColor({}, 'border');
  const [availableWidth, setAvailableWidth] = useState(dimensions.width - 32);
  const [measuredContainerWidth, setMeasuredContainerWidth] = useState<
    number | null
  >(null);
  const measuredContainerWidthRef = useRef<number | null>(null);
  const [footnoteSelection, setFootnoteSelection] = useState<{
    document: ZhihuDocument;
    id: string;
  } | null>(null);
  const metrics = useMemo(
    () =>
      createRichContentMetrics(
        fontSizeScale ?? settings.fontSizeScale,
        lineHeightScale ?? settings.lineHeightScale,
      ),
    [
      fontSizeScale,
      lineHeightScale,
      settings.fontSizeScale,
      settings.lineHeightScale,
    ],
  );
  const { fontSize, lineHeight } = metrics.body;
  const scaledEm = fontSize * dimensions.fontScale;
  const width = options.integerMeasure
    ? Math.max(scaledEm, Math.floor(availableWidth / scaledEm) * scaledEm)
    : availableWidth;
  const normalized = useMemo(() => {
    const normalizationOptions = {
      documentId: `${type}:${objectId}`,
      variant,
      segmentInfos,
      linkCardInfo,
    };
    return contentArray
      ? normalizeZhihuContentSegments(contentArray, normalizationOptions)
      : normalizeZhihuDocument(content, normalizationOptions);
  }, [
    content,
    contentArray,
    linkCardInfo,
    objectId,
    segmentInfos,
    type,
    variant,
  ]);
  const compiled = useMemo(
    () =>
      compileZhihuDocument(normalized.document, {
        fontSize,
        lineHeight,
        paragraphSpacing: RICH_CONTENT_PARAGRAPH_SPACING,
      }),
    [fontSize, lineHeight, normalized.document],
  );
  const documentRevision = useRef({
    content,
    contentArray,
    objectId,
    type,
    variant,
    version: 0,
  });
  if (
    documentRevision.current.content !== content ||
    documentRevision.current.contentArray !== contentArray ||
    documentRevision.current.objectId !== objectId ||
    documentRevision.current.type !== type ||
    documentRevision.current.variant !== variant
  ) {
    documentRevision.current = {
      content,
      contentArray,
      objectId,
      type,
      variant,
      version: documentRevision.current.version + 1,
    };
  }
  const currentCompilation = useRef(compiled);
  currentCompilation.current = compiled;
  const previewImages = useMemo(
    () =>
      getZhihuDocumentPreviewImages(normalized.document).map(
        (image) => image.url,
      ),
    [normalized.document],
  );
  const handleImage = useCallback(
    (url: string) => onImagePress?.(url, previewImages),
    [onImagePress, previewImages],
  );
  const measuredFlowsRef = useRef(new Map<string, string>());
  const [revealedLayout, setRevealedLayout] = useState<{ key: string } | null>(
    null,
  );
  const revealedGeometryRef = useRef<string | null>(null);
  const notifiedLayoutRef = useRef<{
    compiled: typeof compiled;
    key: string;
  } | null>(null);
  const segments = useMemo(() => {
    const map = new Map<string, ZhihuSegmentRun | ZhihuSegmentHighlightRun>();
    for (const node of walkZhihuDocument(normalized.document)) {
      if (node.type === 'segment' || node.type === 'segmentHighlight')
        map.set(node.id, node);
    }
    return map;
  }, [normalized.document]);
  const configJson = useMemo(
    () =>
      JSON.stringify({
        fontSize,
        lineHeight,
        paragraphSpacing: RICH_CONTENT_PARAGRAPH_SPACING,
        textColor,
        secondaryColor,
        linkColor,
        justify: options.justify ?? false,
        fontScale: dimensions.fontScale,
      }),
    [
      fontSize,
      lineHeight,
      linkColor,
      options.justify,
      secondaryColor,
      textColor,
      dimensions.fontScale,
    ],
  );
  const documentLayoutSuffix = `${configJson}:${compiled.parts
    .filter((part) => part.type === 'flow')
    .map((part) => `${part.flow.id}:${part.flow.textVersion}`)
    .join('|')}`;
  const documentLayoutPrefix = `${normalized.document.id}:${documentRevision.current.version}`;
  const documentLayoutKey = `${documentLayoutPrefix}:${width}:${documentLayoutSuffix}`;
  const documentGeometryKey = `${documentLayoutPrefix}:${width}:${configJson}`;
  const geometrySourceRef = useRef(documentGeometryKey);
  if (geometrySourceRef.current !== documentGeometryKey) {
    geometrySourceRef.current = documentGeometryKey;
    revealedGeometryRef.current = null;
    measuredFlowsRef.current = new Map();
    notifiedLayoutRef.current = null;
  }
  const currentLayout = useRef({ compiled, key: documentLayoutKey });
  currentLayout.current = { compiled, key: documentLayoutKey };
  const notifyLayoutReady = useCallback(
    (key: string) => {
      if (currentCompilation.current !== compiled) return;
      // A block-only document can reveal from onLayout before the state update
      // commits its first actual width. Keep that measured geometry eligible.
      geometrySourceRef.current = key;
      if (revealedGeometryRef.current !== key) {
        revealedGeometryRef.current = key;
        setRevealedLayout({ key });
      }
      if (notifiedLayoutRef.current?.key === key) return;
      notifiedLayoutRef.current = { compiled, key };
      onLayoutReady?.();
    },
    [compiled, onLayoutReady],
  );
  const onFlowMeasured = useCallback(
    (flow: RichTextFlow) => {
      if (
        currentLayout.current.compiled !== compiled ||
        currentLayout.current.key !== documentLayoutKey
      )
        return;
      measuredFlowsRef.current.set(
        flow.id,
        flowMeasureKey(flow, width, configJson),
      );
      if (
        measuredContainerWidthRef.current === availableWidth &&
        compiled.parts.every(
          (part) =>
            part.type !== 'flow' ||
            measuredFlowsRef.current.get(part.flow.id) ===
              flowMeasureKey(part.flow, width, configJson),
        )
      ) {
        // Notify in the same event batch that reveals the body. The host's
        // content-size handler must already consider this layout ready.
        notifyLayoutReady(documentGeometryKey);
      }
    },
    [
      availableWidth,
      compiled,
      documentLayoutKey,
      documentGeometryKey,
      notifyLayoutReady,
      width,
      configJson,
    ],
  );
  const initialLayoutReady =
    measuredContainerWidth === availableWidth &&
    revealedGeometryRef.current === documentGeometryKey &&
    revealedLayout?.key === documentGeometryKey;
  const handleLink = useCallback(
    (url: string) => {
      if (url.startsWith('zhihu-rich-footnote:')) {
        const definitionId = url.slice('zhihu-rich-footnote:'.length);
        try {
          setFootnoteSelection({
            document: normalized.document,
            id: decodeURIComponent(definitionId),
          });
        } catch {
          return;
        }
        return;
      }
      setFootnoteSelection(null);
      onLinkPress?.(url);
    },
    [normalized.document, onLinkPress],
  );
  const handleSelection = useCallback(
    (event: FlowEvent, flow: RichTextFlow) => {
      if (currentCompilation.current !== compiled) return;
      if (event.flowId !== flow.id || event.textVersion !== flow.textVersion)
        return;
      if (event.start === -1 && event.end === -1) {
        onSelectionChange?.(
          { ...event, mapping: null },
          flow,
          normalized.document,
        );
        return;
      }
      if (
        !Number.isInteger(event.start) ||
        !Number.isInteger(event.end) ||
        event.start < 0 ||
        event.end < event.start ||
        event.end > flow.text.length
      )
        return;
      onSelectionChange?.(
        {
          ...event,
          mapping: mapRichTextSelection(flow, event.start, event.end),
        },
        flow,
        normalized.document,
      );
    },
    [compiled, normalized.document, onSelectionChange],
  );
  const handleAction = useCallback(
    (event: ActionEvent, flow: RichTextFlow) => {
      if (currentCompilation.current !== compiled) return;
      if (event.flowId !== flow.id || event.textVersion !== flow.textVersion)
        return;
      if (event.kind === 'link') {
        const span = flow.spans.find(
          (candidate) =>
            candidate.kind === 'link' && candidate.nodeId === event.id,
        );
        if (span?.url) handleLink(span.url);
      } else if (event.kind === 'segment') {
        const decoration = flow.decorations.find(
          (candidate) => candidate.actionId === event.id,
        );
        if (!decoration) return;
        const segment = segments.get(event.id);
        const mapping = mapRichTextSelection(
          flow,
          decoration.start,
          decoration.end,
        );
        onSegmentPress?.(
          {
            nodeId: event.id,
            paragraphId: mapping?.start.paragraphId,
            start: mapping?.start.offset ?? decoration.start,
            end: mapping?.end.offset ?? decoration.end,
            text: getRichTextSelectionText(
              flow,
              decoration.start,
              decoration.end,
            ),
            segment,
          },
          normalized.document,
        );
      } else {
        const attachment = flow.attachments.find(
          (candidate) => candidate.id === event.id,
        );
        if (attachment?.url && attachment.kind === 'image') {
          if (event.kind === 'attachmentLongPress')
            onImageLongPress?.(attachment.url);
          else handleImage(attachment.url);
        }
      }
    },
    [
      compiled,
      handleLink,
      onImageLongPress,
      handleImage,
      onSegmentPress,
      normalized.document,
      segments,
    ],
  );
  const footnote = normalized.document.footnotes?.find(
    (definition) =>
      footnoteSelection?.document === normalized.document &&
      definition.id === footnoteSelection.id,
  );
  const footnoteText = footnote?.blocks.map(blockText).join('\n\n') || '';
  const available = isRichTextNativeAvailable();

  if (!available) return <>{renderFallback()}</>;

  return (
    <View
      key={`${documentLayoutPrefix}:${configJson}`}
      onLayout={(event) => {
        if (
          currentLayout.current.compiled !== compiled ||
          currentLayout.current.key !== documentLayoutKey
        )
          return;
        const available = event.nativeEvent.layout.width;
        if (!Number.isFinite(available) || available <= 0) return;
        const nextWidth = options.integerMeasure
          ? Math.max(scaledEm, Math.floor(available / scaledEm) * scaledEm)
          : available;
        const nextGeometryKey = `${documentLayoutPrefix}:${nextWidth}:${configJson}`;
        measuredContainerWidthRef.current = available;
        setAvailableWidth(available);
        setMeasuredContainerWidth(available);
        const measured = measuredFlowsRef.current;
        if (
          compiled.parts.every(
            (part) =>
              part.type !== 'flow' ||
              measured.get(part.flow.id) ===
                flowMeasureKey(part.flow, nextWidth, configJson),
          )
        )
          notifyLayoutReady(nextGeometryKey);
      }}
      style={styles.content}
    >
      {!initialLayoutReady ? (
        renderPlaceholder ? (
          renderPlaceholder()
        ) : (
          <View
            testID="native-content-placeholder"
            accessibilityLabel="正文正在加载"
            accessibilityRole="progressbar"
            style={{ width: '100%', gap: lineHeight - fontSize }}
          >
            {[1, 2, 3, 4].map((line) => (
              <View
                key={line}
                style={{
                  width: line === 4 ? '65%' : '100%',
                  height: fontSize,
                  backgroundColor: borderColor,
                  borderRadius: 3,
                  opacity: 0.4,
                }}
              />
            ))}
          </View>
        )
      ) : null}
      <View
        pointerEvents={initialLayoutReady ? 'auto' : 'none'}
        style={[
          styles.content,
          !initialLayoutReady && {
            position: 'absolute',
            top: 0,
            left: 0,
            opacity: 0,
          },
        ]}
      >
        {compiled.parts.map((part) =>
          part.type === 'flow' ? (
            <NativeFlow
              key={part.flow.id}
              flow={part.flow}
              contentWidth={width}
              configJson={configJson}
              fontSize={fontSize}
              lineHeight={lineHeight}
              selectable={selectable}
              options={options}
              linkColor={linkColor}
              onSelection={handleSelection}
              onAction={handleAction}
              onMeasured={onFlowMeasured}
            />
          ) : (
            <NativeBlock
              key={part.block.id}
              block={part.block}
              width={availableWidth}
              fontSize={fontSize}
              lineHeight={lineHeight}
              textColor={textColor}
              secondaryColor={secondaryColor}
              linkColor={linkColor}
              surfaceColor={surfaceColor}
              borderColor={borderColor}
              onLink={handleLink}
              onImage={handleImage}
              onImageLongPress={onImageLongPress}
              configJson={configJson}
              selectable={selectable}
              options={options}
              onFlowAction={handleAction}
              onFlowSelection={handleSelection}
              renderLinkCard={renderLinkCard}
            />
          ),
        )}
      </View>
      <Modal
        visible={Boolean(footnote)}
        transparent
        animationType="fade"
        onRequestClose={() => setFootnoteSelection(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.footnotePanel, { backgroundColor: surfaceColor }]}
          >
            <Text style={[styles.cardTitle, { color: textColor }]}>
              脚注 {footnote?.label}
            </Text>
            <ScrollView>
              {footnote?.blocks.map((block) => (
                <NativeBlock
                  key={block.id}
                  block={block}
                  width={Math.min(availableWidth, dimensions.width - 80)}
                  fontSize={fontSize}
                  lineHeight={lineHeight}
                  textColor={textColor}
                  secondaryColor={secondaryColor}
                  linkColor={linkColor}
                  surfaceColor={surfaceColor}
                  borderColor={borderColor}
                  onLink={handleLink}
                  onImage={handleImage}
                  onImageLongPress={onImageLongPress}
                  configJson={configJson}
                  selectable={selectable}
                  options={options}
                  onFlowAction={handleAction}
                  renderLinkCard={renderLinkCard}
                />
              ))}
            </ScrollView>
            <View style={styles.footnoteActions}>
              <Pressable
                onPress={() => {
                  void Clipboard.setStringAsync(footnoteText);
                }}
              >
                <Text style={{ color: linkColor }}>复制</Text>
              </Pressable>
              <Pressable onPress={() => setFootnoteSelection(null)}>
                <Text style={{ color: linkColor }}>返回正文</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  content: { width: '100%', alignItems: 'center' },
  block: { marginVertical: 10 },
  imageFallback: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  caption: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  formula: { alignItems: 'center', paddingVertical: 12 },
  formulaFallback: { fontFamily: 'monospace', fontSize: 17, padding: 12 },
  mediaCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    width: '100%',
  },
  cardTitle: { fontSize: 16, lineHeight: 23, fontWeight: '700' },
  tableRow: { flexDirection: 'row' },
  code: { padding: 12, borderRadius: 8, marginVertical: 10, width: '100%' },
  quote: { borderLeftWidth: 3, paddingLeft: 15, marginVertical: 10 },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
    marginVertical: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000055',
    justifyContent: 'center',
    padding: 24,
  },
  footnotePanel: { borderRadius: 16, padding: 20, maxHeight: '70%', gap: 16 },
  footnoteActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
});
