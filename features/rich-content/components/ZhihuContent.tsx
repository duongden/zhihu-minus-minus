import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { type Href, useRouter } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  type GestureResponderEvent,
  Image,
  type ImageProps,
  type ImageStyle,
  Linking,
  Pressable,
  View as RNView,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import RenderHtml, {
  type CustomBlockRenderer,
  type CustomTagRendererRecord,
  type DomVisitorCallbacks,
  defaultSystemFonts,
  type MixedStyleRecord,
  type RenderersProps,
  type TNode,
  useNormalizedUrl,
  useRendererProps,
} from 'react-native-render-html';
import { SvgUri } from 'react-native-svg';
import {
  getAnswer,
  reactAnswerSegment,
  unreactAnswerSegment,
} from '@/api/zhihu/answer';
import { getArticle } from '@/api/zhihu/article';
import { getPin } from '@/api/zhihu/pin';
import { getQuestion } from '@/api/zhihu/question';
import { BouncyButton } from '@/components/BouncyButton';
import { ImageActionBottomSheet } from '@/components/ImageActionBottomSheet';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { ActionSheet } from '@/components/overlays/ActionSheet';
import {
  Text,
  useRuntimeThemeColors,
  useThemeColor,
  View,
} from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import { typography } from '@/constants/designTokens';
import { useSettingsStore } from '@/store/useSettingsStore';
import type {
  ZhihuSegmentInfo,
  ZhihuSegmentMark,
  ZhihuSegmentReaction,
} from '@/types/zhihu';
import { showToast } from '@/utils/toast';
import {
  extractZhihuRedirectTarget,
  getSafeExternalUrl,
  parseZhihuUrl,
} from '@/utils/url';
import { getZhihuErrorStatus } from '@/utils/zhihuError';
import type { ZhihuDocument, ZhihuLinkCardBlock } from '../document';
import {
  DAILY_AVATAR_SIZE,
  isDailyAvatar,
  type RichContentVariant,
} from '../imagePolicy';
import {
  getNativeHighlightDisplayText,
  resolveNativeAnswerSegment,
  resolveNativeAnswerSelection,
} from '../nativeInteractions';
import {
  createRichContentMetrics,
  RICH_CONTENT_BLOCK_FORMULA_HEIGHT,
  RICH_CONTENT_INLINE_FORMULA_HEIGHT,
  RICH_CONTENT_LIST_INDENT,
  RICH_CONTENT_LIST_ITEM_SPACING,
  RICH_CONTENT_PARAGRAPH_SPACING,
  RICH_CONTENT_UNKNOWN_IMAGE_HEIGHT,
} from '../presentation';
import type { RichTextFlow } from '../richText';
import { createSelectionReactionOptions } from '../selectionReaction';
import type {
  LinkCardProps,
  RichContentRenderer,
  ZhihuContentProps,
} from '../types';
import ZhihuDOMContent, { type TextSelectionInfo } from './ZhihuDOMContent';
import {
  ZhihuNativeContent,
  type ZhihuNativeContentSelection,
  type ZhihuNativeSegmentAction,
} from './ZhihuNativeContent';

export type { RichContentRenderer, ZhihuContentProps } from '../types';

interface LinkCardDisplay {
  title?: unknown;
  card_open_url?: unknown;
  desc?: unknown;
  content?: unknown;
  [key: string]: unknown;
}

interface LinkCardMetadata {
  display?: LinkCardDisplay;
  [key: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseLinkCardMetadata(value: unknown): LinkCardMetadata | null {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value)) as LinkCardMetadata | null;
    } catch {
      return null;
    }
  }
  return asRecord(value) as LinkCardMetadata | null;
}

function getLinkCardMetadata(
  linkCardInfo: Record<string, unknown> | undefined,
  ...urls: Array<string | undefined>
): LinkCardMetadata | null {
  if (!linkCardInfo) return null;
  for (const url of urls) {
    if (!url) continue;
    const metadata = parseLinkCardMetadata(linkCardInfo[url]);
    if (metadata) return metadata;
  }
  return null;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isLikelyUrl(value: string | undefined): boolean {
  return !!value && /^(?:https?:)?\/\//i.test(value.trim());
}

function getImageUrl(value: unknown): string | undefined {
  const candidate = getString(value);
  if (!candidate || !isLikelyUrl(candidate)) return undefined;
  return candidate.startsWith('//') ? `https:${candidate}` : candidate;
}

function stripHtml(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return (
    value
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim() || undefined
  );
}

function getLinkCardImage(display: LinkCardDisplay | null): string | undefined {
  if (!display) return undefined;
  const content = asRecord(display.content);
  return (
    getImageUrl(display.image_url) ||
    getImageUrl(display.cover_url) ||
    getImageUrl(display.thumbnail) ||
    getImageUrl(content?.image_url) ||
    getImageUrl(content?.cover_url) ||
    getImageUrl(content?.thumbnail) ||
    getImageUrl(content?.url) ||
    getImageUrl(content?.src)
  );
}

interface LinkCardElementLike {
  name?: string;
  tagName?: string;
  attributes?: Record<string, string | undefined>;
  attribs?: Record<string, string | undefined>;
}

function isLinkCardElement(element: LinkCardElementLike): boolean {
  const tagName = element?.name || element?.tagName;
  const attributes = element?.attributes || element?.attribs || {};
  return (
    tagName === 'a' &&
    (attributes.class?.includes('LinkCard') ||
      attributes['data-draft-type'] === 'link-card')
  );
}

export const LinkCard: React.FC<LinkCardProps> = React.memo(
  ({ url, title, image, cardInfo, onPress, surfaceColor }) => {
    const metadata = useMemo(() => parseLinkCardMetadata(cardInfo), [cardInfo]);
    const display = asRecord(metadata?.display) as LinkCardDisplay | null;
    const displayTitle = getString(display?.title);
    const providedTitle = getString(title);
    const usableTitle = !isLikelyUrl(providedTitle) ? providedTitle : undefined;
    const cardUrl = getString(display?.card_open_url) || url;
    const description = stripHtml(getString(display?.desc));
    const internalPath = useMemo(() => parseZhihuUrl(cardUrl), [cardUrl]);
    const isInternal = internalPath !== null;
    const themeColors = useRuntimeThemeColors();
    const primaryColor = themeColors.link;
    const cardBorderColor = useThemeColor({}, 'contentBorderStrong');

    const parsedId = useMemo(() => {
      if (!internalPath) return null;
      const match = internalPath.match(
        /^\/(question|answer|article|pin)\/(\d+)$/,
      );
      if (match) {
        return {
          type: match[1] as 'question' | 'answer' | 'article' | 'pin',
          id: match[2],
        };
      }
      return null;
    }, [internalPath]);

    const { data: fetchedData } = useQuery({
      queryKey: ['linkcard', parsedId?.type, parsedId?.id],
      queryFn: async () => {
        if (!parsedId) return null;
        try {
          if (parsedId.type === 'answer') return await getAnswer(parsedId.id);
          if (parsedId.type === 'question')
            return await getQuestion(parsedId.id);
          if (parsedId.type === 'article') return await getArticle(parsedId.id);
          if (parsedId.type === 'pin') return await getPin(parsedId.id);
          return null;
        } catch (err: unknown) {
          if (getZhihuErrorStatus(err) === 404) {
            return null;
          }
          throw err;
        }
      },
      enabled: !!parsedId && !displayTitle,
      staleTime: 10 * 60 * 1000,
      retry: false,
    });

    const fetchedTitle =
      displayTitle ||
      usableTitle ||
      fetchedData?.question?.title ||
      fetchedData?.title ||
      fetchedData?.excerpt_title;

    const fetchedImage =
      getImageUrl(image) ||
      getLinkCardImage(display) ||
      getImageUrl(fetchedData?.cover_url);

    const fetchedSubtitle =
      description ||
      fetchedData?.author?.name ||
      fetchedData?.question?.title ||
      null;

    const fetchedStat =
      fetchedData?.voteup_count != null
        ? `${fetchedData.voteup_count} 赞同`
        : fetchedData?.like_count != null
          ? `${fetchedData.like_count} 喜欢`
          : fetchedData?.answer_count != null
            ? `${fetchedData.answer_count} 回答`
            : null;

    const getLinkTypeIcon = (): React.ComponentProps<
      typeof Ionicons
    >['name'] => {
      if (url.includes('/question/')) return 'help-circle';
      if (url.includes('/answer/')) return 'chatbubble-ellipses';
      if (url.includes('/pin/')) return 'navigate';
      return 'link';
    };

    return (
      <View className="w-full" style={{ overflow: 'visible' }}>
        <BouncyButton
          onPress={() => onPress(cardUrl)}
          className="w-full p-3 rounded-xl my-3"
          style={[
            {
              backgroundColor: surfaceColor,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: cardBorderColor,
            },
          ]}
        >
          <View className="bg-transparent" pointerEvents="none">
            {fetchedTitle ? (
              <Text
                className="text-[15px] font-bold leading-5 mb-1.5"
                numberOfLines={2}
              >
                {fetchedTitle}
              </Text>
            ) : (
              <Text className="text-[14px] leading-5 mb-1.5" numberOfLines={1}>
                {url}
              </Text>
            )}
            {fetchedSubtitle && (
              <Text type="secondary" className="text-xs mb-1" numberOfLines={1}>
                {fetchedSubtitle}
              </Text>
            )}
            {!description && (
              <View className="flex-row items-center bg-transparent">
                <Ionicons
                  name={getLinkTypeIcon()}
                  size={14}
                  color={primaryColor}
                />
                <Text type="secondary" className="text-xs ml-1">
                  {fetchedStat || (isInternal ? '知乎内容' : '外部链接')}
                </Text>
              </View>
            )}
          </View>
          {fetchedImage && (
            <Image
              source={{ uri: fetchedImage }}
              className="w-full h-[120px] rounded-lg mt-2.5"
              style={[{ backgroundColor: themeColors.backgroundSecondary }]}
            />
          )}
        </BouncyButton>
      </View>
    );
  },
);

interface TextSlice {
  text: string;
  interaction?: SegmentInteraction;
  isLiked?: boolean;
}

type SegmentInteraction = ZhihuSegmentReaction & {
  mark?: ZhihuSegmentMark;
};

interface ActiveSegment {
  pid: string;
  text: string;
  reactionText: string;
  copyText: string;
  is_like: boolean;
  like_count: number;
  comment_count: number;
  seg_ids?: string[] | string;
  startIndex: number;
  endIndex: number;
}

function sliceParagraphText(
  fullText: string,
  marks: ZhihuSegmentInfo['marks'] | undefined,
): TextSlice[] {
  if (!fullText) return [];
  if (!marks || marks.length === 0) {
    return [{ text: fullText }];
  }

  const sortedMarks = [...marks].sort((a, b) => a.start_index - b.start_index);
  const slices: TextSlice[] = [];
  let currentIndex = 0;

  for (const mark of sortedMarks) {
    const { start_index, end_index } = mark;
    const interaction =
      mark.seg_info?.like_count ||
      mark.seg_info?.comment_count ||
      mark.seg_info?.is_like
        ? mark.seg_info
        : mark.master_seg_info?.like_count ||
            mark.master_seg_info?.comment_count ||
            mark.master_seg_info?.is_like
          ? mark.master_seg_info
          : null;

    if (!interaction) continue;

    if (start_index > currentIndex) {
      slices.push({ text: fullText.slice(currentIndex, start_index) });
    }

    if (end_index > start_index) {
      slices.push({
        text: fullText.slice(start_index, end_index),
        interaction: { ...interaction, mark },
        isLiked: !!interaction.is_like,
      });
      currentIndex = end_index;
    }
  }

  if (currentIndex < fullText.length) {
    slices.push({ text: fullText.slice(currentIndex) });
  }

  return slices.length > 0 ? slices : [{ text: fullText }];
}

function getTNodeText(node: TNode | null | undefined): string {
  if (!node) return '';
  return node.type === 'text'
    ? node.data
    : node.children.map(getTNodeText).join('');
}

interface ParagraphRendererProps {
  segmentMap: Map<string, ZhihuSegmentInfo>;
  onPress: (
    pid: string,
    segment: ZhihuSegmentInfo,
    interaction: SegmentInteraction,
  ) => void;
  fontSize?: number;
  lineHeight?: number;
}

interface ImageRendererProps {
  onPress: (src: string) => void;
  onLongPress?: (src: string) => void;
  width: number;
  colorScheme: 'light' | 'dark';
  variant: RichContentVariant;
}

interface LinkCardRendererProps {
  onLinkCardPress: (url: string) => void;
  surfaceColor: string;
  colorScheme: 'light' | 'dark';
  linkCardInfo?: Record<string, unknown>;
}

type ZhihuRenderersProps = Omit<Partial<RenderersProps>, 'a' | 'img'> & {
  a: { onPress: (event: GestureResponderEvent, href: string) => void };
  img: ImageRendererProps;
  linkcard: LinkCardRendererProps;
  p: ParagraphRendererProps;
};

const P_Renderer: CustomBlockRenderer = ({ TDefaultRenderer, ...props }) => {
  const { tnode } = props;
  const rendererProps = useRendererProps('p');
  const textColor = useThemeColor({}, 'text');
  const textSecondaryColor = useThemeColor({}, 'textSecondary');
  const lightPrimaryColor = useThemeColor({}, 'primary_60');

  if (!rendererProps) return <TDefaultRenderer {...props} />;

  const {
    segmentMap,
    onPress,
    fontSize = typography.fontSize.subtitle,
    lineHeight = typography.fontSize.subtitle * 1.5,
  } = rendererProps as unknown as ParagraphRendererProps;
  const isBlockquoteParagraph = tnode.parent?.tagName === 'blockquote';
  const paragraphTextColor = isBlockquoteParagraph
    ? textSecondaryColor
    : textColor;
  const blockquoteParagraphStyle = isBlockquoteParagraph
    ? {
        color: textSecondaryColor,
        fontSize,
        lineHeight,
      }
    : undefined;

  const pid = tnode.attributes['data-pid'];
  const segment = pid ? segmentMap.get(pid) : null;
  const fullText = segment?.text || getTNodeText(tnode) || '';
  const slices = sliceParagraphText(fullText, segment?.marks);
  const hasAnyInteraction = slices.some((s) => s.interaction);

  if (!hasAnyInteraction || !pid || !segment) {
    return (
      <TDefaultRenderer
        {...props}
        style={[props.style, blockquoteParagraphStyle as unknown as ViewStyle]}
      />
    );
  }

  const textFontSize = fontSize;
  const textLineHeight = lineHeight;

  return (
    <Text
      style={[
        props.style as unknown as StyleProp<TextStyle>,
        {
          color: paragraphTextColor,
          fontSize: textFontSize,
          lineHeight: textLineHeight,
          marginBottom: 14,
          marginTop: 0,
        },
      ]}
    >
      {slices.map((slice, idx) => {
        const interaction = slice.interaction;
        if (interaction) {
          return (
            <Text
              // biome-ignore lint/suspicious/noArrayIndexKey: slices 是单个 segment 一次性切分出的结果,同一 segment 的切分稳定;slice.text 会重复,不能当 key。
              key={idx}
              onPress={() => onPress(pid, segment, interaction)}
              style={{
                color: paragraphTextColor,
                fontSize: textFontSize,
                lineHeight: textLineHeight,
                textDecorationLine: 'underline',
                textDecorationStyle: 'dashed',
                textDecorationColor: lightPrimaryColor,
              }}
            >
              {slice.text}
            </Text>
          );
        }
        return (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: 同上,与相邻分支共用一次 slices.map。
            key={idx}
            style={{
              color: paragraphTextColor,
              fontSize: textFontSize,
              lineHeight: textLineHeight,
            }}
          >
            {slice.text}
          </Text>
        );
      })}
    </Text>
  );
};

const LazyImage: React.FC<{
  src: string;
  style: StyleProp<ViewStyle>;
  resizeMode: 'contain' | 'cover' | 'stretch' | 'center';
  resizeMethod?: 'auto' | 'resize' | 'scale';
  colorScheme: 'light' | 'dark';
  borderRadius?: number;
  onLoad?: ImageProps['onLoad'];
}> = ({ src, style, resizeMode, resizeMethod, borderRadius = 12, onLoad }) => {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<RNView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const themeColors = useRuntimeThemeColors();
  const placeholderColor = themeColors.contentPlaceholder;

  useEffect(() => {
    if (visible) return;

    const checkVisibility = () => {
      containerRef.current?.measureInWindow((_x, y, _width, height) => {
        if (y === undefined) return;
        const { height: screenHeight } = Dimensions.get('window');
        // Load when it's within viewport + 400px scroll-ahead buffer
        if (y < screenHeight + 400 && y + height > -400) {
          setVisible(true);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      });
    };

    checkVisibility();
    timerRef.current = setInterval(checkVisibility, 400);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [visible]);

  return (
    <RNView
      ref={containerRef}
      style={[
        style,
        {
          backgroundColor: placeholderColor,
          borderRadius,
          overflow: 'hidden',
          justifyContent: 'center',
          alignItems: 'center',
        },
      ]}
    >
      {visible ? (
        <Image
          source={{ uri: src }}
          style={[StyleSheet.absoluteFill, { borderRadius }]}
          resizeMode={resizeMode}
          resizeMethod={resizeMethod}
          onLoad={onLoad}
        />
      ) : (
        <ActivityIndicator size="small" color={themeColors.textTertiary} />
      )}
    </RNView>
  );
};

const IMG_Renderer: CustomBlockRenderer = ({ tnode }) => {
  const { src, width: attrWidth, height: attrHeight, eeimg } = tnode.attributes;
  const rendererProps = useRendererProps('img');
  const themeColors = useRuntimeThemeColors();
  const [svgError, setSvgError] = useState(false);
  const [intrinsicAspectRatio, setIntrinsicAspectRatio] = useState<
    number | null
  >(null);

  if (!rendererProps) return null;
  const {
    onPress,
    onLongPress,
    width: contentWidth,
    colorScheme,
    variant,
  } = rendererProps as unknown as ImageRendererProps;

  const originalWidth = parseInt(attrWidth as string, 10) || 0;
  const originalHeight = parseInt(attrHeight as string, 10) || 0;

  if (!src || src.startsWith('data:image/svg')) {
    return null;
  }

  const isFormula =
    src.includes('zhihu.com/equation') || eeimg === '1' || eeimg === '2';
  const alt = tnode.attributes.alt || '';

  // 优先级：eeimg=2 为块级，eeimg=1 为行内；如果缺失则根据源码内容启发式判断
  const isBlockFormula =
    eeimg === '2' ||
    (!eeimg && (alt.includes('\\begin') || alt.includes('\\\\')));

  let displayHeight = RICH_CONTENT_UNKNOWN_IMAGE_HEIGHT;
  let displayWidth: number | string = contentWidth;

  if (originalWidth > 0 && originalHeight > 0) {
    if (isFormula && originalHeight < 100 && originalWidth < contentWidth) {
      // 小公式保持原比例，不拉伸到全屏
      displayWidth = originalWidth;
      displayHeight = originalHeight;
    } else {
      displayHeight = (contentWidth * originalHeight) / originalWidth;
    }
  } else if (isFormula) {
    // 默认高度估计
    displayHeight = isBlockFormula
      ? RICH_CONTENT_BLOCK_FORMULA_HEIGHT
      : RICH_CONTENT_INLINE_FORMULA_HEIGHT;
    displayWidth = isBlockFormula
      ? contentWidth
      : Math.min(contentWidth, Math.max(40, alt.length * 8));
  } else if (intrinsicAspectRatio) {
    displayHeight = contentWidth / intrinsicAspectRatio;
  }

  const imageStyle: ImageStyle = {
    width: displayWidth,
    height: displayHeight,
  };

  // 如果是公式，且是暗色模式，使用 tintColor 将黑色公式变为白色
  if (isFormula && colorScheme === 'dark') {
    imageStyle.tintColor = themeColors.text;
  }

  // 确保 src 有协议
  const finalSrc = src.startsWith('//') ? `https:${src}` : src;

  if (isDailyAvatar(tnode.attributes, variant)) {
    return (
      <Pressable onPress={() => onPress(finalSrc)} style={{ marginRight: 10 }}>
        <LazyImage
          src={finalSrc}
          style={{ width: DAILY_AVATAR_SIZE, height: DAILY_AVATAR_SIZE }}
          resizeMode="cover"
          resizeMethod="resize"
          colorScheme={colorScheme}
          borderRadius={DAILY_AVATAR_SIZE / 2}
        />
      </Pressable>
    );
  }

  if (isFormula && !isBlockFormula) {
    return (
      <Text onPress={() => onPress(finalSrc)}>
        {svgError ? (
          <Text
            style={{
              color: themeColors.text,
              fontSize: 16,
            }}
          >
            {alt || '公式'}
          </Text>
        ) : (
          <SvgUri
            uri={finalSrc}
            width={displayWidth}
            height={displayHeight}
            color={themeColors.text}
            onError={() => setSvgError(true)}
          />
        )}
      </Text>
    );
  }

  return (
    <View
      className={
        isFormula
          ? `my-1.5 items-center bg-transparent ${isBlockFormula ? 'w-full' : ''}`
          : 'my-2.5 items-center w-full bg-transparent'
      }
    >
      <Pressable
        onPress={() => onPress(finalSrc)}
        onLongPress={() => onLongPress?.(finalSrc)}
        className="bg-transparent"
      >
        {isFormula ? (
          svgError ? (
            <Text
              style={{
                color: themeColors.text,
                fontSize: 16,
              }}
            >
              {alt || '公式加载失败'}
            </Text>
          ) : (
            <SvgUri
              uri={finalSrc}
              width={displayWidth}
              height={displayHeight}
              color={themeColors.text}
              onError={() => setSvgError(true)}
            />
          )
        ) : (
          <LazyImage
            src={finalSrc}
            style={imageStyle}
            resizeMode="contain"
            resizeMethod="resize"
            colorScheme={colorScheme}
            onLoad={(event) => {
              if (originalWidth > 0 && originalHeight > 0) return;
              const { width, height } = event.nativeEvent.source;
              if (width > 0 && height > 0) {
                setIntrinsicAspectRatio(width / height);
              }
            }}
          />
        )}
      </Pressable>
    </View>
  );
};

const LinkCardRenderer: CustomBlockRenderer = ({
  tnode,
  TDefaultRenderer,
  ...props
}) => {
  const rawUrl = tnode.attributes.href;
  const normalizedUrl = useNormalizedUrl(rawUrl || '');
  const anchorRendererProps = useRendererProps('a');
  const rendererProps = useRendererProps('linkcard');

  if (!isLinkCardElement(tnode)) {
    const onPress =
      anchorRendererProps?.onPress && normalizedUrl
        ? (event: GestureResponderEvent) =>
            anchorRendererProps.onPress?.(
              event,
              normalizedUrl,
              tnode.attributes,
              (tnode.attributes.target as
                | '_blank'
                | '_self'
                | '_parent'
                | '_top'
                | undefined) || '_blank',
            )
        : props.onPress;
    return <TDefaultRenderer tnode={tnode} {...props} onPress={onPress} />;
  }

  if (!rendererProps) {
    return <TDefaultRenderer tnode={tnode} {...props} />;
  }
  const { onLinkCardPress, surfaceColor, colorScheme, linkCardInfo } =
    rendererProps as unknown as LinkCardRendererProps;

  const url = rawUrl ? extractZhihuRedirectTarget(rawUrl) : rawUrl;
  const metadata = getLinkCardMetadata(linkCardInfo, rawUrl, url);
  const draftTitle = tnode.attributes['data-draft-title'];
  const textTitle = getTNodeText(tnode).trim();
  const title = !isLikelyUrl(draftTitle)
    ? draftTitle
    : !isLikelyUrl(textTitle)
      ? textTitle
      : undefined;

  if (url) {
    return (
      <View style={{ width: '100%' }}>
        <LinkCard
          url={url}
          title={title}
          image={tnode.attributes['data-draft-cover']}
          cardInfo={metadata}
          onPress={onLinkCardPress}
          surfaceColor={surfaceColor}
          colorScheme={colorScheme}
        />
      </View>
    );
  }

  return <TDefaultRenderer tnode={tnode} {...props} />;
};

const renderers: CustomTagRendererRecord = {
  p: P_Renderer,
  img: IMG_Renderer,
  a: LinkCardRenderer,
};

const IGNORED_DOM_TAGS = ['noscript'];
const SYSTEM_FONTS = [...defaultSystemFonts, 'Inter', 'Roboto'];

export const ZhihuContent: React.FC<ZhihuContentProps> = React.memo(
  ({
    content,
    contentArray,
    segmentInfos,
    linkCardInfo,
    objectId,
    type,
    onRefresh,
    renderer,
    renderPlaceholder,
    onLayoutReady,
    fontSizeScale: fontSizeOverride,
    lineHeightScale: lineHeightOverride,
    typographyOptions,
    useNative,
    selectable = true,
    variant = 'default',
  }) => {
    const colorScheme = useColorScheme();
    const { width } = useWindowDimensions();
    const settings = useSettingsStore();
    const fontSizeScale = fontSizeOverride ?? settings.fontSizeScale;
    const lineHeightScale = lineHeightOverride ?? settings.lineHeightScale;
    const metrics = useMemo(
      () => createRichContentMetrics(fontSizeScale, lineHeightScale),
      [fontSizeScale, lineHeightScale],
    );
    const selectedRenderer: RichContentRenderer =
      renderer ??
      (useNative && settings.richContentRenderer === 'webview'
        ? 'rnrh'
        : settings.richContentRenderer);
    const themeColors = useRuntimeThemeColors();
    const textColor = themeColors.text;
    const textSecondaryColor = useThemeColor({}, 'textSecondary');
    const borderColor = useThemeColor({}, 'border');
    const contentBorderColor = useThemeColor({}, 'contentBorder');
    const inverseTextColor = themeColors.onPrimary;
    const surfaceColor = useThemeColor({}, 'surface');
    const router = useRouter();

    const [activeSegment, setActiveSegment] = useState<ActiveSegment | null>(
      null,
    );
    const [modalVisible, setModalVisible] = useState(false);
    const [nativeHighlight, setNativeHighlight] = useState<{
      text: string;
      sourceUrl?: string;
    } | null>(null);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerImage, setViewerImage] = useState<string | null>(null);
    const [viewerImages, setViewerImages] = useState<string[]>([]);
    const [actionSheetUrl, setActionSheetUrl] = useState<string | null>(null);
    const [shouldRender, setShouldRender] = useState(true);
    const [domReady, setDomReady] = useState(false);
    const [useNativeFallback, setUseNativeFallback] = useState(false);

    // 延迟解析 HTML 已不再需要，直接渲染以保证丝滑
    React.useEffect(() => {
      setShouldRender(true);
    }, []);

    // 备选方案：如果 DOM 组件加载太慢或失败，回退到原生渲染
    React.useEffect(() => {
      if (
        selectedRenderer === 'webview' &&
        !contentArray &&
        content &&
        !domReady
      ) {
        const timer = setTimeout(() => {
          if (!domReady) {
            console.log(
              'DOM component timeout, falling back to native rendering',
            );
            setUseNativeFallback(true);
          }
        }, 3500);
        return () => clearTimeout(timer);
      }
    }, [content, domReady, contentArray, selectedRenderer]);

    const handleInternalLink = useCallback(
      (url: string) => {
        if (!url) return;
        // 先解码知乎跳转链接（link.zhihu.com?target=...），拿到真实 URL
        const realUrl = extractZhihuRedirectTarget(url);
        const internalPath = parseZhihuUrl(realUrl);
        if (internalPath && internalPath !== '/') {
          router.push(internalPath as Href);
        } else {
          const externalUrl = getSafeExternalUrl(realUrl);
          if (externalUrl)
            Linking.openURL(externalUrl).catch(() =>
              console.error('Failed to open rich content URL'),
            );
        }
      },
      [router],
    );

    const segmentMap = useMemo(() => {
      const map = new Map<string, ZhihuSegmentInfo>();
      segmentInfos?.forEach((info) => {
        map.set(info.pid, info);
      });
      return map;
    }, [segmentInfos]);

    const toggleSegmentLikeMutation = useMutation({
      mutationFn: async ({
        answerId,
        segment,
      }: {
        answerId: string;
        segment: ActiveSegment;
      }) => {
        const { is_like, seg_ids, reactionText, pid, startIndex, endIndex } =
          segment;
        if (!seg_ids || (Array.isArray(seg_ids) && seg_ids.length === 0)) {
          throw new Error('段落缺少有效的 seg_id');
        }

        if (is_like) {
          return unreactAnswerSegment(answerId, seg_ids);
        } else {
          return reactAnswerSegment(
            answerId,
            seg_ids,
            reactionText,
            pid,
            startIndex || 0,
            endIndex || 0,
          );
        }
      },
      onSuccess: (result, { answerId, segment }) => {
        if (
          interactionSource.current.objectId !== answerId ||
          interactionSource.current.type !== 'answer'
        )
          return;
        onRefresh?.();
        setActiveSegment((current) => {
          if (
            !current ||
            current.pid !== segment.pid ||
            current.startIndex !== segment.startIndex ||
            current.endIndex !== segment.endIndex ||
            current.seg_ids !== segment.seg_ids
          )
            return current;
          return {
            ...current,
            is_like: !segment.is_like,
            seg_ids: segment.is_like
              ? segment.seg_ids
              : result.segmentIds
                ? [...result.segmentIds]
                : undefined,
            like_count: Math.max(
              0,
              segment.like_count + (segment.is_like ? -1 : 1),
            ),
          };
        });
        showToast(segment.is_like ? '已取消赞同' : '已赞同');
      },
      onError: () => {
        showToast('操作失败，请重试');
      },
    });

    const findActiveInteraction = useCallback(
      (segment: ZhihuSegmentInfo | null | undefined) => {
        const marks = segment?.marks;
        if (!marks || marks.length === 0) return null;
        for (const mark of marks) {
          if (mark.seg_info?.is_like) return { ...mark.seg_info, mark };
          if (mark.master_seg_info?.is_like)
            return { ...mark.master_seg_info, mark };
        }
        for (const mark of marks) {
          if (mark.master_seg_info) return { ...mark.master_seg_info, mark };
        }
        const firstInfo = marks[0].seg_info || marks[0].master_seg_info;
        return firstInfo ? { ...firstInfo, mark: marks[0] } : null;
      },
      [],
    );

    const handlePress = useCallback(
      (
        pid: string,
        segment: ZhihuSegmentInfo,
        interaction: SegmentInteraction,
        copyText?: string,
      ) => {
        const mark = interaction.mark;
        const startIndex = mark?.start_index ?? 0;
        const endIndex = mark?.end_index ?? segment.text.length;
        if (type !== 'answer') {
          setNativeHighlight({
            text: copyText ?? segment.text.slice(startIndex, endIndex),
          });
          return;
        }
        setActiveSegment({
          pid,
          text: segment?.text || '',
          reactionText: segment.text.slice(startIndex, endIndex),
          copyText: copyText ?? segment.text.slice(startIndex, endIndex),
          is_like: !!interaction.is_like,
          like_count: interaction.like_count || 0,
          comment_count: interaction.comment_count || 0,
          seg_ids:
            interaction.seg_ids ||
            mark?.seg_info?.seg_ids ||
            mark?.master_seg_info?.seg_ids,
          startIndex,
          endIndex,
        });
        setModalVisible(true);
      },
      [type],
    );

    const domVisitors = useMemo<DomVisitorCallbacks>(
      () => ({
        onElement: (element) => {
          if (element.name === 'img') {
            const { attribs } = element;
            const originalToken = attribs['data-original-token']?.trim();
            let actualSrc = (
              attribs['data-actualsrc'] ||
              attribs['data-original'] ||
              attribs.src ||
              ''
            ).trim();

            if (actualSrc && originalToken) {
              const tokenRegex = /v2-[a-fA-F0-9]{32}/;
              if (tokenRegex.test(actualSrc)) {
                actualSrc = actualSrc.replace(tokenRegex, originalToken);
              }
            }

            if (actualSrc) {
              // 确保有协议
              attribs.src = actualSrc.startsWith('//')
                ? `https:${actualSrc}`
                : actualSrc;
            }
            if (attribs['data-rawwidth'])
              attribs.width = attribs['data-rawwidth'];
            if (attribs['data-rawheight'])
              attribs.height = attribs['data-rawheight'];
          }
          if (element.name === 'p') {
            const pid = element.attribs['data-pid'];
            const segment = pid ? segmentMap.get(pid) : null;
            const interaction = findActiveInteraction(segment);
            if (
              interaction &&
              (interaction.like_count > 0 ||
                interaction.comment_count > 0 ||
                interaction.is_like)
            ) {
              element.attribs.class = `${element.attribs.class || ''} segment-interactable`;
              if (interaction.is_like) {
                element.attribs.class += ' segment-liked';
              }
            }
          }
        },
      }),
      [segmentMap, findActiveInteraction],
    );

    const renderersProps = useMemo<ZhihuRenderersProps>(
      () => ({
        p: {
          segmentMap,
          onPress: handlePress,
          fontSize: metrics.body.fontSize,
          lineHeight: metrics.body.lineHeight,
        },
        a: {
          onPress: (_event: GestureResponderEvent, href: string) =>
            handleInternalLink(href),
        },
        linkcard: {
          onLinkCardPress: handleInternalLink,
          surfaceColor,
          colorScheme,
          linkCardInfo,
        },
        img: {
          onPress: (src: string) => {
            setViewerImage(src);
            setViewerVisible(true);
          },
          onLongPress: (src: string) => {
            setActionSheetUrl(src);
          },
          width: width - 40,
          colorScheme,
          variant,
        },
      }),
      [
        segmentMap,
        handlePress,
        linkCardInfo,
        colorScheme,
        handleInternalLink,
        surfaceColor,
        width,
        metrics,
        variant,
      ],
    );

    const primaryColor = useThemeColor({}, 'primary');
    const linkColor = themeColors.link;
    const lightPrimaryColor = useThemeColor({}, 'primary_40');

    const classesStyles = useMemo(
      () => ({
        'segment-interactable': {
          textDecorationLine: 'underline',
          textDecorationStyle: 'dashed',
          textDecorationColor: lightPrimaryColor,
        },
        'segment-liked': {
          textDecorationLine: 'underline',
          textDecorationStyle: 'dashed',
          textDecorationColor: lightPrimaryColor,
        },
        ...(variant === 'daily'
          ? {
              meta: {
                flexDirection: 'row' as const,
                alignItems: 'center' as const,
                flexWrap: 'wrap' as const,
                minHeight: DAILY_AVATAR_SIZE,
                marginBottom: 20,
              },
              author: {
                color: textColor,
                fontSize: 15 * fontSizeScale,
                fontWeight: '600' as const,
              },
              bio: {
                color: textSecondaryColor,
                flexGrow: 1,
                flexShrink: 1,
                fontSize: 14 * fontSizeScale,
              },
              'question-title': { display: 'none' as const },
            }
          : {}),
      }),
      [
        fontSizeScale,
        lightPrimaryColor,
        textColor,
        textSecondaryColor,
        variant,
      ],
    );

    const tagsStyles = useMemo(
      () => ({
        p: {
          color: textColor,
          fontSize: metrics.body.fontSize,
          lineHeight: metrics.body.lineHeight,
          marginBottom: RICH_CONTENT_PARAGRAPH_SPACING,
          marginTop: 0,
          textAlign: typographyOptions?.justify ? 'justify' : 'left',
        },
        b: { color: textColor, fontWeight: 'bold' },
        strong: { color: textColor, fontWeight: 'bold' },
        img: { borderRadius: 12, marginVertical: 10, display: 'inline' },
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: primaryColor,
          paddingLeft: RICH_CONTENT_PARAGRAPH_SPACING,
          paddingRight: 10,
          backgroundColor: 'transparent',
          paddingVertical: 10,
          marginVertical: 12,
          fontSize: metrics.body.fontSize,
          lineHeight: metrics.body.lineHeight,
          color: textSecondaryColor,
        },
        h1: {
          color: textColor,
          fontSize: metrics.headings.h1.fontSize,
          fontWeight: 'bold',
          marginTop: metrics.headings.h1.marginTop,
          marginBottom: metrics.headings.h1.marginBottom,
          lineHeight: metrics.headings.h1.lineHeight,
        },
        h2: {
          color: textColor,
          fontSize: metrics.headings.h2.fontSize,
          fontWeight: 'bold',
          marginTop: metrics.headings.h2.marginTop,
          marginBottom: metrics.headings.h2.marginBottom,
          lineHeight: metrics.headings.h2.lineHeight,
        },
        h3: {
          color: textColor,
          fontSize: metrics.headings.h3.fontSize,
          fontWeight: 'bold',
          marginTop: metrics.headings.h3.marginTop,
          marginBottom: metrics.headings.h3.marginBottom,
          lineHeight: metrics.headings.h3.lineHeight,
        },
        h4: {
          color: textColor,
          fontSize: metrics.headings.h4.fontSize,
          fontWeight: 'bold',
          marginTop: metrics.headings.h4.marginTop,
          marginBottom: metrics.headings.h4.marginBottom,
          lineHeight: metrics.headings.h4.lineHeight,
        },
        h5: {
          color: textColor,
          fontSize: metrics.headings.h5.fontSize,
          fontWeight: 'bold',
          marginTop: metrics.headings.h5.marginTop,
          marginBottom: metrics.headings.h5.marginBottom,
          lineHeight: metrics.headings.h5.lineHeight,
        },
        h6: {
          color: textColor,
          fontSize: metrics.headings.h6.fontSize,
          fontWeight: 'bold',
          marginTop: metrics.headings.h6.marginTop,
          marginBottom: metrics.headings.h6.marginBottom,
          lineHeight: metrics.headings.h6.lineHeight,
        },
        ul: {
          paddingLeft: RICH_CONTENT_LIST_INDENT,
          color: textColor,
          marginVertical: 8,
          fontSize: metrics.body.fontSize,
          lineHeight: metrics.body.lineHeight,
        },
        ol: {
          paddingLeft: RICH_CONTENT_LIST_INDENT,
          color: textColor,
          marginVertical: 8,
          fontSize: metrics.body.fontSize,
          lineHeight: metrics.body.lineHeight,
        },
        li: {
          marginBottom: RICH_CONTENT_LIST_ITEM_SPACING,
          color: textColor,
          fontSize: metrics.body.fontSize,
          lineHeight: metrics.body.lineHeight,
        },
        hr: {
          height: 1,
          backgroundColor: contentBorderColor,
          marginVertical: 20,
        },
        figure: { marginVertical: 12, alignItems: 'center' },
        figcaption: {
          color: textSecondaryColor,
          fontSize: metrics.captionFontSize,
          marginTop: 6,
          textAlign: 'center',
          opacity: 0.7,
        },
        span: { color: textColor },
        div: { color: textColor },
        a: { color: linkColor, textDecorationLine: 'none' },
        code: {
          backgroundColor: borderColor,
          borderRadius: 4,
          paddingHorizontal: 5,
          paddingVertical: 2,
          fontFamily: 'monospace',
          fontSize: metrics.codeFontSize,
        },
      }),
      [
        textColor,
        textSecondaryColor,
        borderColor,
        contentBorderColor,
        metrics,
        primaryColor,
        linkColor,
        typographyOptions?.justify,
      ],
    );

    const defaultTextProps = useMemo(
      () => ({ selectable, lineBreakStrategyIOS: 'standard' as const }),
      [selectable],
    );

    const renderPinContent = () => {
      if (!contentArray) return null;
      return contentArray.map((item, index) => {
        if (item.type === 'text') {
          return (
            <RenderHtml
              // biome-ignore lint/suspicious/noArrayIndexKey: contentArray 是想法正文的解析结果,按原文顺序混排文本/图片/链接卡片。ZhihuContentSegment 没有 id,内容本身也不保证唯一,index 是这里唯一稳定的标识。
              key={index}
              contentWidth={width - 40}
              source={{ html: `<div>${item.content}</div>` }}
              renderers={renderers}
              tagsStyles={tagsStyles as unknown as MixedStyleRecord}
              classesStyles={classesStyles as unknown as MixedStyleRecord}
              domVisitors={domVisitors}
              systemFonts={SYSTEM_FONTS}
              renderersProps={
                renderersProps as unknown as Partial<RenderersProps>
              }
              ignoredDomTags={IGNORED_DOM_TAGS}
              defaultTextProps={defaultTextProps}
            />
          );
        }
        if (item.type === 'image' && item.url) {
          const imageUrl = item.url;
          return (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: 同上,与相邻分支共用一次 contentArray.map。
              key={index}
              className="my-2.5 items-center w-full bg-transparent"
            >
              <BouncyButton
                className="rounded-xl"
                onPress={() => {
                  setViewerImage(imageUrl);
                  setViewerVisible(true);
                }}
              >
                <Image
                  source={{ uri: imageUrl }}
                  className="rounded-xl"
                  style={{ width: width - 40, height: 250 }}
                  resizeMode="cover"
                />
              </BouncyButton>
            </View>
          );
        }
        if (item.type === 'link_card' && item.url) {
          return (
            <LinkCard
              // biome-ignore lint/suspicious/noArrayIndexKey: 同上,与相邻分支共用一次 contentArray.map。
              key={index}
              url={item.url}
              title={item.data_draft_title}
              image={item.data_draft_cover}
              onPress={handleInternalLink}
              surfaceColor={surfaceColor}
              colorScheme={colorScheme}
            />
          );
        }
        return null;
      });
    };

    const onReadyCallback = useCallback(() => setDomReady(true), []);
    const onImagePressCallback = useCallback(
      (src: string, gallery?: readonly string[]) => {
        setViewerImage(src);
        setViewerImages(gallery?.includes(src) ? [...gallery] : [src]);
        setViewerVisible(true);
      },
      [],
    );
    const onImageLongPressCallback = useCallback((src: string) => {
      setActionSheetUrl(src);
    }, []);
    const onSegmentPressCallback = useCallback(
      (pid: string) => {
        const segment = segmentMap.get(pid);
        if (segment) {
          const interaction = findActiveInteraction(segment);
          if (interaction) {
            handlePress(pid, segment, interaction);
          }
        }
      },
      [segmentMap, findActiveInteraction, handlePress],
    );
    const onNativeSegmentPressCallback = useCallback(
      (action: ZhihuNativeSegmentAction, document: ZhihuDocument) => {
        if (document.id !== `${type}:${objectId}`) return;
        const resolved = resolveNativeAnswerSegment(action, {
          objectId,
          type,
          segmentInfos,
          document,
        });
        if (resolved) {
          setNativeHighlight(null);
          handlePress(
            resolved.pid,
            resolved.segment,
            resolved.interaction,
            getNativeHighlightDisplayText(action, document) ?? action.text,
          );
        } else if (action.segment) {
          const text =
            getNativeHighlightDisplayText(action, document) ?? action.text;
          if (text.trim())
            setNativeHighlight({
              text,
              sourceUrl:
                action.segment.type === 'segmentHighlight'
                  ? action.segment.highlight?.sourceUrl
                  : undefined,
            });
        }
      },
      [objectId, type, segmentInfos, handlePress],
    );
    const renderNativeLinkCard = useCallback(
      (card: ZhihuLinkCardBlock) => (
        <LinkCard
          url={card.url}
          title={card.title}
          image={card.image?.url}
          cardInfo={{
            display: {
              ...(!isLikelyUrl(card.title) && { title: card.title }),
              card_open_url: card.url,
              desc: card.description,
              image: { image_url: card.image?.url },
            },
          }}
          onPress={handleInternalLink}
          surfaceColor={surfaceColor}
          colorScheme={colorScheme}
        />
      ),
      [handleInternalLink, surfaceColor, colorScheme],
    );

    // --- Segment reaction from text selection ---
    const [textSelection, setTextSelection] =
      useState<TextSelectionInfo | null>(null);
    const interactionSource = useRef({
      content,
      contentArray,
      objectId,
      type,
      selectedRenderer,
    });

    useEffect(() => {
      const previous = interactionSource.current;
      if (
        previous.content === content &&
        previous.contentArray === contentArray &&
        previous.objectId === objectId &&
        previous.type === type &&
        previous.selectedRenderer === selectedRenderer
      )
        return;
      interactionSource.current = {
        content,
        contentArray,
        objectId,
        type,
        selectedRenderer,
      };
      setDomReady(false);
      setUseNativeFallback(false);
      setTextSelection(null);
      setModalVisible(false);
      setActiveSegment(null);
      setNativeHighlight(null);
    }, [content, contentArray, objectId, type, selectedRenderer]);

    const onTextSelectedCallback = useCallback(
      (info: TextSelectionInfo | null) => {
        setTextSelection(info);
      },
      [],
    );
    const onNativeTextSelectedCallback = useCallback(
      (
        selection: ZhihuNativeContentSelection,
        flow: RichTextFlow,
        document: ZhihuDocument,
      ) => {
        if (document.id !== `${type}:${objectId}`) return;
        setTextSelection(
          resolveNativeAnswerSelection(selection, flow, {
            objectId,
            type,
            document,
            segmentInfos,
          }),
        );
      },
      [objectId, type, segmentInfos],
    );

    const currentTextSelection = useRef(textSelection);
    currentTextSelection.current = textSelection;
    const createReactionMutation = useMutation(
      createSelectionReactionOptions({
        getSource: () => interactionSource.current,
        getSelection: () => currentTextSelection.current,
        clearSelection: () => setTextSelection(null),
        refresh: onRefresh,
        notifySuccess: () => showToast('已赞同此段落'),
        notifyError: () => showToast('操作失败，请重试'),
      }),
    );
    const domStyle = useMemo(
      () => ({ backgroundColor: 'transparent', minHeight: 400 }),
      [],
    );
    const nativeContentSource = useMemo(
      () => ({ html: `<div>${content || ''}</div>` }),
      [content],
    );
    const renderRnrhContent = () => (
      <View>
        <RenderHtml
          contentWidth={width - 40}
          source={nativeContentSource}
          renderers={renderers}
          tagsStyles={tagsStyles as unknown as MixedStyleRecord}
          classesStyles={classesStyles as unknown as MixedStyleRecord}
          domVisitors={domVisitors}
          systemFonts={SYSTEM_FONTS}
          renderersProps={renderersProps as unknown as Partial<RenderersProps>}
          ignoredDomTags={IGNORED_DOM_TAGS}
          defaultTextProps={defaultTextProps}
        />
      </View>
    );

    if (!shouldRender && !contentArray) {
      return (
        <View className="h-[200px] justify-center items-center bg-transparent">
          <ActivityIndicator size="small" color={primaryColor} />
        </View>
      );
    }

    return (
      <View className="bg-transparent">
        {selectedRenderer === 'native-v2' ? (
          <ZhihuNativeContent
            content={content || ''}
            contentArray={contentArray}
            objectId={objectId}
            type={type}
            segmentInfos={segmentInfos}
            linkCardInfo={linkCardInfo}
            variant={variant}
            fontSizeScale={fontSizeScale}
            lineHeightScale={lineHeightScale}
            options={typographyOptions}
            onLinkPress={handleInternalLink}
            onImagePress={onImagePressCallback}
            onImageLongPress={onImageLongPressCallback}
            onSegmentPress={onNativeSegmentPressCallback}
            onSelectionChange={onNativeTextSelectedCallback}
            renderLinkCard={renderNativeLinkCard}
            selectable={selectable}
            renderFallback={contentArray ? renderPinContent : renderRnrhContent}
            renderPlaceholder={renderPlaceholder}
            onLayoutReady={onLayoutReady}
          />
        ) : contentArray ? (
          renderPinContent()
        ) : selectedRenderer === 'rnrh' || useNativeFallback ? (
          renderRnrhContent()
        ) : (
          <View style={{ minHeight: 400 }}>
            {!domReady && !useNativeFallback && (
              <View className="absolute inset-0 z-10 justify-center items-center bg-transparent">
                <ActivityIndicator size="small" color={primaryColor} />
                <Text type="secondary" className="mt-4 text-xs opacity-50">
                  正在建立连接...
                </Text>
              </View>
            )}
            <ZhihuDOMContent
              htmlContent={content || ''}
              segmentInfosStr={JSON.stringify(segmentInfos)}
              linkCardInfoStr={JSON.stringify(linkCardInfo || {})}
              colorScheme={colorScheme}
              onReady={onReadyCallback}
              onImagePress={onImagePressCallback}
              onImageLongPress={onImageLongPressCallback}
              onLinkPress={handleInternalLink}
              onSegmentPress={onSegmentPressCallback}
              onTextSelected={
                type === 'answer' ? onTextSelectedCallback : undefined
              }
              variant={variant}
              fontSizeScale={fontSizeScale}
              lineHeightScale={lineHeightScale}
              typographyOptions={typographyOptions}
              style={domStyle}
            />
          </View>
        )}

        <ActionSheet
          visible={modalVisible && Boolean(activeSegment)}
          onClose={() => setModalVisible(false)}
          hapticFeedback={false}
          title="段落操作"
          subtitle={(() => {
            if (!activeSegment) return undefined;
            const { text, startIndex, endIndex } = activeSegment;
            const selected = text
              .slice(startIndex || 0, endIndex || text.length)
              .trim();
            return selected || text;
          })()}
          options={
            activeSegment
              ? [
                  {
                    key: 'like',
                    icon: activeSegment.is_like
                      ? ('heart' as const)
                      : ('heart-outline' as const),
                    label: `${activeSegment.like_count || 0} 赞同`,
                    color: activeSegment.is_like
                      ? themeColors.danger
                      : undefined,
                    disabled:
                      toggleSegmentLikeMutation.isPending ||
                      !activeSegment.seg_ids,
                    onPress: () => {
                      if (activeSegment)
                        toggleSegmentLikeMutation.mutate({
                          answerId: objectId,
                          segment: activeSegment,
                        });
                    },
                  },
                  {
                    key: 'comments',
                    icon: 'chatbubble-outline' as const,
                    label: `${activeSegment.comment_count || 0} 评论`,
                    disabled: !activeSegment.seg_ids,
                    onPress: () => {
                      const { seg_ids, text, startIndex, endIndex } =
                        activeSegment;
                      const segmentId = Array.isArray(seg_ids)
                        ? seg_ids.join(',')
                        : seg_ids;
                      const selected = text.slice(startIndex, endIndex);
                      const queryParams = [
                        `type=${type}`,
                        segmentId
                          ? `segmentId=${encodeURIComponent(segmentId)}`
                          : null,
                        `pid=${encodeURIComponent(activeSegment.pid)}`,
                        `startOffset=${startIndex}`,
                        `endOffset=${endIndex}`,
                        selected
                          ? `text=${encodeURIComponent(selected)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join('&');
                      router.push(`/comments/${objectId}?${queryParams}`);
                    },
                  },
                  {
                    key: 'copy',
                    icon: 'copy-outline' as const,
                    label: '复制',
                    onPress: async () => {
                      await Clipboard.setStringAsync(activeSegment.copyText);
                      showToast('已复制');
                    },
                  },
                  {
                    key: 'discussion',
                    icon: 'chatbubbles-outline' as const,
                    label: '查看详细讨论',
                    onPress: () => {
                      const { text, startIndex, endIndex } = activeSegment;
                      const selected = text
                        .slice(startIndex || 0, endIndex || text.length)
                        .trim();
                      const queryParams = [
                        `type=${type}`,
                        selected
                          ? `text=${encodeURIComponent(selected)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join('&');
                      router.push(`/comments/${objectId}?${queryParams}`);
                    },
                  },
                ]
              : []
          }
        />

        <ActionSheet
          visible={Boolean(nativeHighlight)}
          onClose={() => setNativeHighlight(null)}
          title="知识点"
          subtitle={nativeHighlight?.text}
          options={
            nativeHighlight
              ? [
                  {
                    key: 'copy',
                    icon: 'copy-outline' as const,
                    label: '复制',
                    onPress: async () => {
                      await Clipboard.setStringAsync(nativeHighlight.text);
                      showToast('已复制');
                    },
                  },
                  ...(nativeHighlight.sourceUrl
                    ? [
                        {
                          key: 'source',
                          icon: 'open-outline' as const,
                          label: '查看来源',
                          onPress: () =>
                            handleInternalLink(nativeHighlight.sourceUrl || ''),
                        },
                      ]
                    : []),
                ]
              : []
          }
        />

        <ImagePreviewModal
          visible={viewerVisible && Boolean(viewerImage)}
          imageUrls={
            viewerImage
              ? viewerImages.includes(viewerImage)
                ? viewerImages
                : [viewerImage]
              : []
          }
          initialIndex={
            viewerImage ? Math.max(0, viewerImages.indexOf(viewerImage)) : 0
          }
          onClose={() => setViewerVisible(false)}
        />

        <ImageActionBottomSheet
          visible={Boolean(actionSheetUrl)}
          imageUrl={actionSheetUrl}
          onClose={() => setActionSheetUrl(null)}
        />

        {textSelection && type === 'answer' && (
          <View
            className="mt-3 rounded-2xl overflow-hidden"
            style={[
              {
                backgroundColor: surfaceColor,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: contentBorderColor,
              },
            ]}
          >
            <View className="px-4 pt-3 pb-2 bg-transparent">
              <Text type="secondary" className="text-xs mb-1.5">
                已选中文字
              </Text>
              <Text
                className="text-[15px] leading-5"
                numberOfLines={2}
                style={{ fontStyle: 'italic' }}
              >
                "{textSelection.text}"
              </Text>
            </View>
            <View
              className="flex-row items-center justify-between px-4 py-2.5 bg-transparent"
              style={{
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: contentBorderColor,
              }}
            >
              <BouncyButton
                className="flex-row items-center p-2 rounded-full bg-transparent"
                onPress={() => setTextSelection(null)}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={18}
                  color={textSecondaryColor}
                />
                <Text type="secondary" className="text-sm ml-1">
                  取消
                </Text>
              </BouncyButton>
              <BouncyButton
                className="flex-row items-center rounded-full px-4 py-1.5"
                style={{
                  backgroundColor: primaryColor,
                }}
                onPress={() => {
                  if (textSelection)
                    createReactionMutation.mutate({
                      source: interactionSource.current,
                      selection: textSelection,
                    });
                }}
                disabled={createReactionMutation.isPending}
              >
                {createReactionMutation.isPending ? (
                  <ActivityIndicator size="small" color={inverseTextColor} />
                ) : (
                  <>
                    <Ionicons name="heart" size={16} color={inverseTextColor} />
                    <Text
                      className="text-sm font-bold ml-1"
                      style={{ color: inverseTextColor }}
                    >
                      赞同
                    </Text>
                  </>
                )}
              </BouncyButton>
            </View>
          </View>
        )}
      </View>
    );
  },
);
