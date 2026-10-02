import {
  type FeedItem,
  getContentVoteCount,
  getContentVoteState,
  type ZhihuMember,
} from '@/api/zhihu';
import { Text } from '@/components/Themed';
import type {
  ZhihuSearchResultItem,
  ZhihuSearchResultObject,
} from '@/types/zhihu';
import { normalizeUserFeedType } from '@/utils/userProfile';

function highlightText(text: string, color: string) {
  const decoded = text
    .replace(/&lt;em&gt;/g, '<em>')
    .replace(/&lt;\/em&gt;/g, '</em>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
  return decoded.split(/(<em>.*?<\/em>)/gs).map((part, index) =>
    part.startsWith('<em>') && part.endsWith('</em>') ? (
      <Text
        // biome-ignore lint/suspicious/noArrayIndexKey: segments only identify fixed positions within this immutable string.
        key={index}
        style={{ color, fontWeight: '700' }}
      >
        {part.slice(4, -5)}
      </Text>
    ) : (
      part
    ),
  );
}

export function toProfileSearchFeedItem(
  result: ZhihuSearchResultItem,
  member: ZhihuMember,
  highlightColor: string,
): FeedItem | null {
  const content = result.object as
    | (ZhihuSearchResultObject & {
        favlists_count?: number;
        favorite_count?: number;
      })
    | undefined;
  if (!content || !String(content.id ?? '').trim()) return null;
  const type = normalizeUserFeedType(content.type);
  if (!type) return null;
  const title =
    content.question?.title ||
    content.question?.name ||
    content.title ||
    '无标题';
  return {
    id: String(content.id),
    type,
    title: result.highlight?.title
      ? highlightText(result.highlight.title, highlightColor)
      : title,
    titleString: title,
    excerpt: result.highlight?.description
      ? highlightText(result.highlight.description, highlightColor)
      : content.excerpt || '',
    image: content.thumbnail_info?.thumbnails?.[0]?.url || null,
    voteCount:
      type === 'videos' ? 0 : (getContentVoteCount(type, content) ?? 0),
    commentCount: content.comment_count || 0,
    author: {
      id: content.author?.id || member.id,
      name: content.author?.name || member.name || '匿名用户',
      avatar: content.author?.avatar_url || member.avatar_url || '',
      url_token: content.author?.url_token || member.url_token,
    },
    questionId:
      content.question?.id !== undefined
        ? String(content.question.id)
        : type === 'questions'
          ? String(content.id)
          : undefined,
    voted: type === 'videos' ? 0 : (getContentVoteState(type, content) ?? 0),
    favlistsCount: content.favlists_count || content.favorite_count || 0,
  };
}
