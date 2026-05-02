import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import { useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Image,
  InteractionManager,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
} from 'react-native';
import { isInternalZhihuLink, parseZhihuUrl } from '@/utils/url';
import RenderHtml, {
  type CustomBlockRenderer,
  defaultSystemFonts,
  useRendererProps,
} from 'react-native-render-html';
import { reactAnswerSegment, unreactAnswerSegment } from '@/api/zhihu/answer';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { showToast } from '@/utils/toast';
import { Text, View } from './Themed';
import MathView from './MathView';
import ZhihuDOMContent from './ZhihuDOMContent';

interface SegmentInfo {
  pid: string;
  text: string;
  marks: Array<{
    start_index: number;
    end_index: number;
    seg_info?: {
      like_count: number;
      comment_count: number;
      is_like: boolean;
      seg_ids?: string[];
    };
    master_seg_info?: {
      like_count: number;
      comment_count: number;
      is_like: boolean;
      seg_ids?: string[];
    };
  }>;
}

interface ZhihuContentProps {
  content?: string;
  contentArray?: any[];
  segmentInfos?: SegmentInfo[];
  objectId: string;
  type: 'answer' | 'article' | 'pin';
  onRefresh?: () => void;
}

const LinkCard: React.FC<{
  url: string;
  title?: string;
  image?: string;
  onPress: (url: string) => void;
  surfaceColor: string;
  colorScheme: 'light' | 'dark';
}> = React.memo(({ url, title, image, onPress, surfaceColor, colorScheme }) => {
  const isInternal = url.includes('zhihu.com');

  const getLinkTypeIcon = () => {
    if (url.includes('/question/')) return 'help-circle';
    if (url.includes('/answer/')) return 'chatbubble-ellipses';
    if (url.includes('/pin/')) return 'navigate';
    return 'link';
  };

  return (
    <TouchableOpacity
      onPress={() => onPress(url)}
      activeOpacity={0.7}
      className="flex-row items-center p-3 rounded-xl my-2.5"
      style={[
        {
          backgroundColor: surfaceColor,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: 'rgba(150,150,150,0.15)',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 2,
        },
      ]}
    >
      <View className="flex-1 mr-2.5 bg-transparent" pointerEvents="none">
        <Text
          className="text-[15px] font-bold leading-5 mb-1.5"
          numberOfLines={2}
        >
          {title || url}
        </Text>
        <View className="flex-row items-center bg-transparent">
          <Ionicons
            name={getLinkTypeIcon() as any}
            size={14}
            color={Colors[colorScheme].primary}
          />
          <Text type="secondary" className="text-xs ml-1">
            {isInternal ? '知乎内部链接' : '外部链接'}
          </Text>
        </View>
      </View>
      {image && (
        <Image
          source={{ uri: image }}
          className="w-[60px] h-[60px] rounded-lg"
          style={[{ backgroundColor: Colors[colorScheme].backgroundSecondary }]}
        />
      )}
    </TouchableOpacity>
  );
});

const P_Renderer: CustomBlockRenderer = ({ TDefaultRenderer, ...props }) => {
  const { tnode } = props;
  const rendererProps = useRendererProps('p');

  if (!rendererProps) return <TDefaultRenderer {...props} />;

  const {
    segmentMap,
    activeSegmentId,
    modalVisible,
    onPress,
    findActiveInteraction,
    colorScheme,
  } = rendererProps as any;

  const pid = tnode.attributes['data-pid'];
  const segment = pid ? segmentMap.get(pid) : null;
  const interaction = findActiveInteraction(segment);
  const hasInteraction =
    interaction &&
    (interaction.like_count > 0 ||
      interaction.comment_count > 0 ||
      interaction.is_like);
  const isLiked = interaction?.is_like;
  const isActive = activeSegmentId === pid && modalVisible;

  const handlePress = () => {
    if (hasInteraction && interaction) {
      onPress(pid, segment, interaction);
    }
  };

  const content = <TDefaultRenderer {...props} />;

  if (!hasInteraction) {
    return content;
  }

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-start bg-transparent overflow-visible rounded-xl py-1.5 px-2 -mx-2 my-1"
      style={[
        isActive && {
          backgroundColor: Colors[colorScheme].primaryTransparent,
        },
        !isActive && isLiked && { backgroundColor: 'rgba(0, 132, 255, 0.05)' },
      ]}
    >
      {content}
    </Pressable>
  );
};

const IMG_Renderer: CustomBlockRenderer = ({ tnode }) => {
  const {
    src,
    width: attrWidth,
    height: attrHeight,
    eeimg,
  } = tnode.attributes;
  const rendererProps = useRendererProps('img');

  if (!rendererProps) return null;
  const { onPress, width: contentWidth, colorScheme } = rendererProps as any;

  const originalWidth = parseInt(attrWidth as string) || 0;
  const originalHeight = parseInt(attrHeight as string) || 0;

  if (!src || src.startsWith('data:image/svg')) {
    return null;
  }

  const isFormula =
    src.includes('zhihu.com/equation') || eeimg === '1' || eeimg === '2';
  const alt = tnode.attributes.alt || '';

  // 优先级：eeimg=2 为块级，eeimg=1 为行内；如果缺失则根据源码内容启发式判断
  const isBlockFormula = eeimg === '2' || (!eeimg && (alt.includes('\\begin') || alt.includes('\\\\')));

  let displayHeight = 200;
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
    displayHeight = isBlockFormula ? 60 : 22;
    displayWidth = contentWidth;
  }

  const imageStyle: any = {
    width: displayWidth,
    height: displayHeight,
  };

  // 确保 src 有协议
  const finalSrc = src.startsWith('//') ? `https:${src}` : src;

  // 如果有 LaTeX 源码，尝试渲染源码 (MathView DOM Component)
  if (isFormula && alt) {
    return (
      <View
        className={
          isFormula
            ? `my-1.5 items-center bg-transparent ${isBlockFormula ? 'w-full' : ''}`
            : 'my-2.5 items-center w-full bg-transparent'
        }
      >
        <Pressable onPress={() => onPress(finalSrc)} className="bg-transparent w-full">
          <MathView
            dom={{ matchContents: true }}
            formula={alt}
            displayMode={isBlockFormula}
            colorScheme={colorScheme}
            style={{ backgroundColor: 'transparent' }}
          />
        </Pressable>
      </View>
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
      <Pressable onPress={() => onPress(finalSrc)} className="bg-transparent">
        <Image
          source={{ uri: finalSrc }}
          className={isFormula ? '' : 'rounded-xl bg-[rgba(150,150,150,0.1)]'}
          style={imageStyle}
          resizeMode="contain"
        />
      </Pressable>
    </View>
  );
};

const A_Renderer: CustomBlockRenderer = ({
  tnode,
  TDefaultRenderer,
  ...props
}) => {
  const isLinkCard =
    tnode.attributes.class?.includes('LinkCard') ||
    tnode.attributes['data-draft-type'] === 'link-card';
  const url = tnode.attributes.href;
  const rendererProps = useRendererProps('a');

  if (!rendererProps) return <TDefaultRenderer tnode={tnode} {...props} />;
  const { onLinkCardPress, surfaceColor, colorScheme } = rendererProps as any;

  if (isLinkCard && url) {
    return (
      <LinkCard
        url={url}
        title={tnode.attributes['data-draft-title']}
        onPress={onLinkCardPress}
        surfaceColor={surfaceColor}
        colorScheme={colorScheme}
      />
    );
  }

  return <TDefaultRenderer tnode={tnode} {...props} />;
};

const renderers = {
  p: P_Renderer,
  img: IMG_Renderer,
  a: A_Renderer,
};

export const ZhihuContent: React.FC<ZhihuContentProps> = React.memo(
  ({ content, contentArray, segmentInfos, objectId, type, onRefresh }) => {
    const colorScheme = useColorScheme();
    const { width } = useWindowDimensions();
    const textColor = Colors[colorScheme].text;
    const surfaceColor = Colors[colorScheme].surface;
    const router = useRouter();

    const [activeSegment, setActiveSegment] = useState<{
      pid: string;
      text: string;
      is_like: boolean;
      like_count: number;
      comment_count: number;
      seg_ids?: string[];
      startIndex?: number;
      endIndex?: number;
    } | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerImage, setViewerImage] = useState<string | null>(null);
    const [shouldRender, setShouldRender] = useState(true);

    // 延迟解析 HTML 已不再需要，直接渲染以保证丝滑
    React.useEffect(() => {
      setShouldRender(true);
    }, []);

    const handleInternalLink = useCallback(
      (url: string) => {
        if (!url) return;
        const internalPath = parseZhihuUrl(url);
        if (internalPath && internalPath !== '/') {
          router.push(internalPath as any);
        } else {
          Linking.openURL(url).catch((err) =>
            console.error('Failed to open URL:', err),
          );
        }
      },
      [router],
    );

    const segmentMap = useMemo(() => {
      const map = new Map<string, SegmentInfo>();
      segmentInfos?.forEach((info) => {
        map.set(info.pid, info);
      });
      return map;
    }, [segmentInfos]);

    const toggleSegmentLikeMutation = useMutation({
      mutationFn: async () => {
        if (!activeSegment) return;
        const { is_like, seg_ids, text, pid, startIndex, endIndex } =
          activeSegment;
        const segId = Array.isArray(seg_ids) ? seg_ids[0] : (seg_ids as any);

        if (is_like) {
          return unreactAnswerSegment(objectId, segId);
        } else {
          return reactAnswerSegment(
            objectId,
            segId,
            text,
            pid,
            startIndex || 0,
            endIndex || 0,
          );
        }
      },
      onSuccess: () => {
        onRefresh?.();
        if (activeSegment) {
          setActiveSegment({
            ...activeSegment,
            is_like: !activeSegment.is_like,
            like_count: activeSegment.is_like
              ? activeSegment.like_count - 1
              : activeSegment.like_count + 1,
          });
          showToast(activeSegment.is_like ? '已取消赞同' : '已赞同');
        }
      },
    });

    const findActiveInteraction = useCallback(
      (segment: SegmentInfo | null | undefined) => {
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
      (pid: string, segment: SegmentInfo, interaction: any) => {
        const mark = interaction.mark;
        setActiveSegment({
          pid,
          text: segment?.text || '',
          is_like: !!interaction.is_like,
          like_count: interaction.like_count || 0,
          comment_count: interaction.comment_count || 0,
          seg_ids:
            interaction.seg_ids ||
            mark?.seg_info?.seg_ids ||
            (mark as any)?.master_seg_info?.seg_ids,
          startIndex: mark?.start_index || 0,
          endIndex: mark?.end_index || segment?.text.length || 0,
        });
        setModalVisible(true);
      },
      [],
    );

    const domVisitors = useMemo(
      () => ({
        onElement: (element: any) => {
          if (element.name === 'img') {
            const { attribs } = element;
            const actualSrc = (
              attribs['data-actualsrc'] ||
              attribs['data-original'] ||
              attribs.src || ''
            ).trim();
            if (actualSrc) {
              // 确保有协议
              attribs.src = actualSrc.startsWith('//') ? `https:${actualSrc}` : actualSrc;
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
              element.attribs.class =
                (element.attribs.class || '') + ' segment-interactable';
              if (interaction.is_like) {
                element.attribs.class += ' segment-liked';
              }
            }
          }
        },
      }),
      [segmentMap, findActiveInteraction],
    );

    const renderersProps = useMemo(
      () => ({
        p: {
          segmentMap,
          activeSegmentId: activeSegment?.pid,
          modalVisible,
          onPress: handlePress,
          findActiveInteraction,
          colorScheme,
        },
        a: {
          onPress: (event: any, href: string) => handleInternalLink(href),
          onLinkCardPress: handleInternalLink,
          surfaceColor,
          colorScheme,
        },
        img: {
          onPress: (src: string) => {
            setViewerImage(src);
            setViewerVisible(true);
          },
          width: width - 40,
          colorScheme,
        },
      }),
      [
        segmentMap,
        activeSegment?.pid,
        modalVisible,
        handlePress,
        findActiveInteraction,
        colorScheme,
        handleInternalLink,
        surfaceColor,
        width,
      ],
    );

    const classesStyles = useMemo(
      () => ({
        'segment-interactable': {
          textDecorationLine: 'underline',
          textDecorationColor: Colors[colorScheme].primaryTransparent,
        },
        'segment-liked': {},
      }),
      [colorScheme],
    );

    const tagsStyles = useMemo(
      () => ({
        p: { color: textColor, fontSize: 18, lineHeight: 28, marginBottom: 20 },
        b: { color: Colors[colorScheme].primary, fontWeight: 'bold' },
        img: { borderRadius: 12, marginVertical: 10 },
        blockquote: {
          borderLeftWidth: 4,
          borderLeftColor: Colors[colorScheme].primary,
          paddingLeft: 18,
          backgroundColor: surfaceColor + '80',
          paddingVertical: 12,
          marginVertical: 15,
          fontStyle: 'italic',
          color: textColor,
        },
        h1: {
          color: textColor,
          fontSize: 22,
          fontWeight: 'bold',
          marginVertical: 20,
          lineHeight: 30,
        },
        h2: {
          color: textColor,
          fontSize: 20,
          fontWeight: 'bold',
          marginVertical: 18,
          lineHeight: 28,
        },
        h3: {
          color: textColor,
          fontSize: 18,
          fontWeight: 'bold',
          marginVertical: 15,
          lineHeight: 26,
        },
        ul: { paddingLeft: 20, color: textColor, marginVertical: 10 },
        ol: { paddingLeft: 20, color: textColor, marginVertical: 10 },
        li: { marginBottom: 8, color: textColor, fontSize: 17, lineHeight: 26 },
        hr: {
          height: 1,
          backgroundColor: 'rgba(150,150,150,0.2)',
          marginVertical: 25,
        },
        figure: { marginVertical: 15, alignItems: 'center' },
        figcaption: {
          color: '#999',
          fontSize: 13,
          marginTop: 8,
          textAlign: 'center',
          fontStyle: 'italic',
        },
        span: { color: textColor },
        div: { color: textColor },
        a: { color: Colors[colorScheme].primary, textDecorationLine: 'none' },
        code: {
          backgroundColor: Colors[colorScheme].border,
          borderRadius: 4,
          paddingHorizontal: 4,
          fontFamily: 'monospace',
          fontSize: 14,
        },
      }),
      [textColor, surfaceColor, colorScheme],
    );

    const systemFonts = [...defaultSystemFonts, 'Inter', 'Roboto'];

    const renderPinContent = () => {
      if (!contentArray) return null;
      return contentArray.map((item, index) => {
        if (item.type === 'text') {
          return (
            <RenderHtml
              key={index}
              contentWidth={width - 40}
              source={{ html: `<div>${item.content}</div>` }}
              renderers={renderers as any}
              tagsStyles={tagsStyles as any}
              classesStyles={classesStyles as any}
              domVisitors={domVisitors}
              systemFonts={systemFonts}
              renderersProps={renderersProps as any}
            />
          );
        }
        if (item.type === 'image') {
          return (
            <View
              key={index}
              className="my-2.5 items-center w-full bg-transparent"
            >
              <Pressable
                onPress={() => {
                  setViewerImage(item.url);
                  setViewerVisible(true);
                }}
              >
                <Image
                  source={{ uri: item.url }}
                  className="rounded-xl"
                  style={{ width: width - 40, height: 250 }}
                  resizeMode="cover"
                />
              </Pressable>
            </View>
          );
        }
        if (item.type === 'link_card') {
          return (
            <LinkCard
              key={index}
              url={item.url}
              title={item.data_draft_title}
              onPress={handleInternalLink}
              surfaceColor={surfaceColor}
              colorScheme={colorScheme}
            />
          );
        }
        return null;
      });
    };

    if (!shouldRender && !contentArray) {
      return (
        <View className="h-[200px] justify-center items-center bg-transparent">
          <ActivityIndicator size="small" color={Colors[colorScheme].primary} />
        </View>
      );
    }

    return (
      <View className="bg-transparent">
        {contentArray ? (
          renderPinContent()
        ) : (
          <ZhihuDOMContent
            dom={{ matchContents: true }}
            htmlContent={content || ''}
            segmentInfos={segmentInfos as any}
            colorScheme={colorScheme}
            onImagePress={(src) => {
              setViewerImage(src);
              setViewerVisible(true);
            }}
            onLinkPress={handleInternalLink}
            onSegmentPress={(pid) => {
              const segment = segmentMap.get(pid);
              if (segment) {
                const interaction = findActiveInteraction(segment);
                if (interaction) {
                  handlePress(pid, segment, interaction);
                }
              }
            }}
            style={{ backgroundColor: 'transparent' }}
          />
        )}

        {modalVisible && (
          <Modal
            visible={modalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setModalVisible(false)}
          >
            <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
              <View className="flex-1 bg-black/10 justify-center items-center">
                <TouchableWithoutFeedback>
                  <View
                    className="p-4 rounded-[20px] w-4/5"
                    style={[
                      {
                        backgroundColor: surfaceColor,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.15,
                        shadowRadius: 12,
                        elevation: 8,
                      },
                    ]}
                  >
                    <View className="flex-row items-center justify-around mb-4 bg-transparent">
                      <Pressable
                        className="flex-row items-center bg-transparent"
                        onPress={() => toggleSegmentLikeMutation.mutate()}
                        disabled={toggleSegmentLikeMutation.isPending}
                      >
                        <Ionicons
                          name={
                            activeSegment?.is_like ? 'heart' : 'heart-outline'
                          }
                          size={24}
                          color={activeSegment?.is_like ? '#ff4d4f' : textColor}
                        />
                        <Text
                          className="text-[15px] font-semibold ml-2"
                          style={[
                            activeSegment?.is_like && { color: '#ff4d4f' },
                          ]}
                        >
                          {activeSegment?.like_count || 0} 赞同
                        </Text>
                      </Pressable>
                      <View className="w-[1px] h-5 bg-[rgba(150,150,150,0.2)]" />
                      <Pressable
                        className="flex-row items-center bg-transparent"
                        onPress={() => {
                          setModalVisible(false);
                          const { seg_ids } = activeSegment || {};
                          const segId = Array.isArray(seg_ids)
                            ? seg_ids[0]
                            : seg_ids;
                          router.push(
                            `/comments/${objectId}?type=${type}${segId ? `&segmentId=${segId}` : ''}`,
                          );
                        }}
                      >
                        <Ionicons
                          name="chatbubble-outline"
                          size={22}
                          color={Colors[colorScheme].primary}
                        />
                        <Text className="text-[15px] font-semibold ml-2">
                          {activeSegment?.comment_count || 0} 评论
                        </Text>
                      </Pressable>
                    </View>
                    <Pressable
                      className="flex-row items-center justify-center py-2.5 bg-transparent"
                      style={{
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: 'rgba(150,150,150,0.1)',
                      }}
                      onPress={() => {
                        setModalVisible(false);
                        router.push(`/comments/${objectId}?type=${type}`);
                      }}
                    >
                      <Text type="primary" className="text-sm font-bold mr-1">
                        查看详细讨论
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={Colors[colorScheme].primary}
                      />
                    </Pressable>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>
        )}

        {viewerVisible && (
          <Modal
            visible={viewerVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setViewerVisible(false)}
          >
            <View className="flex-1 bg-black justify-center items-center">
              <TouchableWithoutFeedback
                onPress={() => setViewerVisible(false)}
              >
                <View className="absolute inset-0" />
              </TouchableWithoutFeedback>

              {viewerImage && (
                <Image
                  source={{ uri: viewerImage }}
                  className="w-full h-full"
                  resizeMode="contain"
                />
              )}

              <TouchableOpacity
                className="absolute right-5 w-[44px] h-[44px] rounded-[22px] bg-black/50 justify-center items-center z-10"
                style={{ top: 50 }}
                onPress={() => setViewerVisible(false)}
              >
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </Modal>
        )}
      </View>
    );
  },
);
