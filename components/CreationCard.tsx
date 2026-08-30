import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { View as NativeView, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useCollectionAction } from '@/hooks/useCollectionAction';
import { useCollectionStore } from '@/store/useCollectionStore';
import { BouncyButton } from './BouncyButton';
import { LikeButton } from './LikeButton';
import { type ShareContentType, ShareMenu } from './ShareMenu';
import { ZhihuContent } from './ZhihuContent';

export const CreationCard = React.forwardRef(
  (
    {
      item,
      type,
      onPress,
      excerpt,
      isExpanded,
      onToggle,
      isCollapsedHighlighted,
    }: {
      item: any;
      type: 'answer' | 'article' | 'question' | 'pin' | 'video';
      onPress?: () => void;
      excerpt?: React.ReactNode;
      isExpanded?: boolean;
      onToggle?: (id: string, expanded: boolean) => void;
      isCollapsedHighlighted?: boolean;
    },
    ref,
  ) => {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const primaryColor = useThemeColor({}, 'primary');
    const warningColor = useThemeColor({}, 'warning');
    const [localExpanded, setLocalExpanded] = React.useState(false);
    const [menuVisible, setMenuVisible] = React.useState(false);
    const footerRef = React.useRef<NativeView>(null);

    const isCollectable = type === 'answer' || type === 'article';
    const storeCollected = useCollectionStore((state) =>
      item?.id ? state.collectedStatusMap[item.id.toString()] : false,
    );
    const isCollected = storeCollected !== undefined ? storeCollected : false;
    const storeOffset = useCollectionStore((state) =>
      item?.id ? state.collectedCountOffsetMap[item.id.toString()] || 0 : 0,
    );
    const displayCount =
      (item?.favlists_count ??
        item?.favlistsCount ??
        item?.favorite_count ??
        item?.reaction?.statistics?.favorites ??
        0) + storeOffset;
    const { toggleCollect } = useCollectionAction();

    React.useImperativeHandle(ref, () => ({
      measureFooter: (cb: any) => footerRef.current?.measureInWindow(cb),
      id: item?.id?.toString() || Math.random().toString(),
    }));

    const expanded = isExpanded !== undefined ? isExpanded : localExpanded;
    const setExpanded = (val: boolean) => {
      if (onToggle && item?.id) {
        onToggle(item.id.toString(), val);
      } else {
        setLocalExpanded(val);
      }
    };

    const handlePress = () => {
      if (onPress) {
        onPress();
        return;
      }
      if (excerpt !== undefined) {
        const cleanTitle = (val: any) => {
          if (typeof val === 'string') return val;
          if (item.titleString) return item.titleString;
          if (item.question?.titleString) return item.question.titleString;
          return '';
        };
        if (type === 'video') {
          router.push({
            pathname: '/video/[id]',
            params: { id: item.id, title: cleanTitle(item.title) },
          } as any);
        } else {
          router.push({
            pathname: `/${type}/[id]`,
            params: {
              id: item.id,
              title: cleanTitle(item.title || item.question?.title),
              questionId: item.question?.id,
            },
          } as any);
        }
        return;
      }
      if (type === 'answer' || type === 'article' || type === 'pin') {
        setExpanded(!expanded);
        return;
      }
    };

    const getFullContent = () => {
      if (!item) return '';
      if (type === 'pin' && Array.isArray(item.content)) {
        return item.content
          .map((c: any) => {
            if (c.type === 'text') return c.content;
            if (c.type === 'link_card')
              return `[链接: ${c.data_draft_title || '查看详情'}]`;
            return '';
          })
          .join('\n')
          .replace(/<[^>]+>/g, '');
      }
      const content = item.content || item.excerpt || '';
      if (typeof content === 'string') {
        return content.replace(/<[^>]+>/g, '');
      }
      return '';
    };

    const getExcerpt = () => {
      if (excerpt !== undefined) return excerpt;
      if (!item) return '';

      if (type === 'pin') {
        if (Array.isArray(item.content)) {
          return item.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.content)
            .join('')
            .replace(/<[^>]+>/g, '')
            .substring(0, 100);
        }
        if (typeof item.content === 'string') {
          return item.content.replace(/<[^>]+>/g, '').substring(0, 100);
        }
      }

      const content = item.excerpt || item.content || '';
      if (typeof content === 'string') {
        return content.replace(/<[^>]+>/g, '').substring(0, 100);
      }
      return '';
    };

    const getTitle = () => {
      if (type === 'pin') return '发布了想法';
      if (type === 'video') return item.title || '发布了视频';
      return item.title || item.question?.title || '未知内容';
    };

    const fullText = getFullContent();
    const isLongContent =
      excerpt === undefined &&
      (type === 'answer' || type === 'article' || type === 'pin') &&
      (fullText.length > 120 ||
        (typeof item.content === 'string' &&
          (item.content.includes('<img') || item.content.includes('<figure'))));

    const displayTypeForShare =
      type === 'answer' ? 'answer' : type === 'article' ? 'article' : 'pin';

    return (
      <BouncyButton
        onPress={handlePress}
        style={[
          {
            backgroundColor: Colors[colorScheme].backgroundSecondary,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: isCollapsedHighlighted ? primaryColor : 'transparent',
          },
          isCollapsedHighlighted && {
            shadowColor: primaryColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 5,
          },
        ]}
        className="p-4 mb-2.5 shadow-sm"
      >
        <BouncyButton
          onPress={() => {
            if (type === 'answer' && item.question?.id) {
              router.push(`/question/${item.question.id}`);
            } else if (type === 'question') {
              router.push(`/question/${item.id}`);
            } else {
              handlePress();
            }
          }}
        >
          <Animated.View
            sharedTransitionTag={`title-${item.question?.id || item.id}`}
          >
            <Text
              className="text-lg font-bold mb-1.5 leading-6 text-foreground dark:text-foreground-dark"
              numberOfLines={expanded ? undefined : 2}
            >
              {getTitle()}
            </Text>
          </Animated.View>
        </BouncyButton>

        <View className="bg-transparent mt-1">
          {expanded &&
          (type === 'answer' || type === 'article' || type === 'pin') ? (
            <View className="flex-1 bg-transparent mt-1">
              <ZhihuContent
                objectId={item.id?.toString()}
                type={type === 'pin' ? 'pin' : type}
                content={
                  typeof item.content === 'string' ? item.content : undefined
                }
                contentArray={
                  type === 'pin' && Array.isArray(item.content)
                    ? item.content
                    : undefined
                }
                useNative={true}
              />
              <Pressable
                onPress={() => setExpanded(false)}
                className="mt-3 py-2.5 flex-row items-center justify-center border-t border-gray-100 dark:border-gray-800"
              >
                <Text className="text-sm text-primary font-bold mr-1">
                  收起
                  {type === 'answer'
                    ? '回答'
                    : type === 'article'
                      ? '文章'
                      : '想法'}
                </Text>
                <Ionicons name="chevron-up" size={14} color={primaryColor} />
              </Pressable>
            </View>
          ) : type === 'answer' || type === 'article' || type === 'pin' ? (
            isLongContent ? (
              <Pressable
                onPress={() => setExpanded(true)}
                style={{ maxHeight: 150, overflow: 'hidden' }}
                className="flex-1"
              >
                <Text
                  type="secondary"
                  className="text-[17px]"
                  style={{ lineHeight: 27 }}
                  numberOfLines={5}
                >
                  {getExcerpt()}
                </Text>
                <Pressable
                  onPress={() => setExpanded(true)}
                  className="absolute inset-x-0 bottom-0 h-24 z-[100]"
                >
                  <LinearGradient
                    colors={[
                      colorScheme === 'dark'
                        ? 'rgba(26, 26, 26, 0)'
                        : 'rgba(255, 255, 255, 0)',
                      colorScheme === 'dark'
                        ? 'rgba(26, 26, 26, 1)'
                        : 'rgba(255, 255, 255, 1)',
                    ]}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      paddingBottom: 10,
                    }}
                  >
                    <View className="flex-row items-center justify-center bg-transparent">
                      <Text
                        type="primary"
                        className="text-[13px] font-bold mr-1"
                        style={{ color: primaryColor }}
                      >
                        展开全文
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={14}
                        color={primaryColor}
                      />
                    </View>
                  </LinearGradient>
                </Pressable>
              </Pressable>
            ) : (
              <View className="flex-1 bg-transparent">
                <ZhihuContent
                  objectId={item.id?.toString()}
                  type={type === 'pin' ? 'pin' : type}
                  content={
                    typeof item.content === 'string' ? item.content : undefined
                  }
                  contentArray={
                    type === 'pin' && Array.isArray(item.content)
                      ? item.content
                      : undefined
                  }
                  useNative={true}
                />
              </View>
            )
          ) : (
            <View className="bg-transparent">
              <Text
                type="secondary"
                className="text-[17px]"
                style={{ lineHeight: 27 }}
                numberOfLines={3}
              >
                {getExcerpt()}
              </Text>
            </View>
          )}
        </View>

        <NativeView
          ref={footerRef}
          className="flex-row justify-between mt-4 items-center bg-transparent"
        >
          {type !== 'question' && type !== 'video' ? (
            <View className="flex-row items-center bg-transparent">
              <LikeButton
                id={item.id}
                count={
                  item.voteCount ??
                  item.voteup_count ??
                  (type === 'pin'
                    ? item.reaction_count || item.like_count
                    : 0) ??
                  0
                }
                voted={
                  item.voted !== undefined
                    ? item.voted
                    : item.relationship?.voting || 0
                }
                type={
                  type === 'article'
                    ? 'articles'
                    : type === 'pin'
                      ? 'pins'
                      : 'answers'
                }
                variant="ghost"
              />
              <Pressable
                onPress={() => {
                  const commentType =
                    type === 'article'
                      ? 'article'
                      : type === 'pin'
                        ? 'pin'
                        : 'answer';
                  router.push(
                    `/comments/${item.id}?type=${commentType}&count=${item.comment_count || 0}`,
                  );
                }}
                className="flex-row items-center ml-5 bg-transparent py-1"
              >
                <Ionicons name="chatbubble-outline" size={16} color="#888" />
                <Text className="ml-1 text-xs font-semibold">
                  {item.comment_count > 0 ? item.comment_count : '0'}
                </Text>
              </Pressable>
              {isCollectable && (
                <Pressable
                  onPress={() => toggleCollect(item.id, type, isCollected)}
                  className="flex-row items-center ml-5 bg-transparent py-1"
                >
                  <Ionicons
                    name={isCollected ? 'star' : 'star-outline'}
                    size={16}
                    color={isCollected ? warningColor : '#888'}
                  />
                  {displayCount > 0 && (
                    <Text
                      className="ml-1 text-xs font-semibold"
                      style={{
                        color: isCollected ? warningColor : '#888',
                      }}
                    >
                      {displayCount}
                    </Text>
                  )}
                </Pressable>
              )}
            </View>
          ) : (
            <Text
              type="secondary"
              className="text-xs text-tertiary dark:text-tertiary-dark"
            >
              {type === 'question'
                ? `${item.answer_count || 0} 回答 · ${item.follower_count || 0} 关注`
                : `${item.reaction?.statistics?.like_count || item.voteup_count || 0} 赞同 · ${item.comment_count || 0} 评论`}
            </Text>
          )}

          <View className="flex-row items-center bg-transparent ml-auto">
            <Text
              type="secondary"
              className="text-xs text-tertiary dark:text-tertiary-dark mr-3"
            >
              {item.updated_time ||
              item.updated ||
              item.created_time ||
              item.created
                ? new Date(
                    (item.updated_time ||
                      item.updated ||
                      item.created_time ||
                      item.created) * 1000,
                  ).toLocaleDateString()
                : ''}
            </Text>
            <BouncyButton
              onPress={() => setMenuVisible(true)}
              className="p-1 -mr-1 bg-transparent"
            >
              <Ionicons name="ellipsis-horizontal" size={18} color="#888" />
            </BouncyButton>
          </View>
        </NativeView>

        <ShareMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          type={displayTypeForShare as ShareContentType}
          data={
            {
              id: item.id,
              title: getTitle(),
              author: item.author?.name,
              authorHeadline: item.author?.headline,
              excerpt: getExcerpt(),
            } as any
          }
        />
      </BouncyButton>
    );
  },
);
