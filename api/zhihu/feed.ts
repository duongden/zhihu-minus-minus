import type { ReactNode } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import apiClient from '../client';

export interface FeedAuthor {
  id: string;
  url_token?: string;
  name: string;
  avatar: string;
  headline?: string;
}

export interface FeedTopic {
  id: string;
  name: string;
}

export interface FeedContentSegment {
  type: string;
  content?: string;
  url?: string;
  data_draft_title?: string;
  data_draft_cover?: string;
}

export interface FeedItem {
  id: string;
  isIdStable?: boolean;
  title: ReactNode;
  questionId?: string;
  actionText?: string;
  author: FeedAuthor;
  excerpt: ReactNode;
  content?: string | FeedContentSegment[];
  image: string | null;
  voteCount: number;
  commentCount: number;
  favlistsCount?: number;
  voted: number;
  type: 'answers' | 'articles' | 'pins' | 'questions' | 'videos';
  topics?: FeedTopic[];
  rank?: number;
  hotValue?: string;
  titleString?: string;
  // —— 本地过滤所需的结构化信号（实测推荐流可用字段，见 utils/feedFilter.ts）——
  /** `answer_type === 'PAID'` 或 `paid_info != null` 即知乎盐选付费内容 */
  answerType?: string;
  /** 推广/利益声明标记，话题流返回、推荐流通常不返回 */
  isLabeled?: boolean;
  /** author.is_org —— 机构号 */
  isOrgAuthor?: boolean;
  /** author.is_advertiser —— 广告主 */
  isAdvertiser?: boolean;
  /** author.is_following —— 当前用户是否关注作者（质量规则的内建豁免依据） */
  isFollowingAuthor?: boolean;
  /** relationship.upvoted_followee_ids 非空 —— 我关注的人赞过 */
  upvotedByFollowee?: boolean;
  /** question.bound_topic_ids，为二期话题屏蔽预留 */
  boundTopicIds?: number[];
  /** question.answer_count，问题类型质量判定用 */
  answerCount?: number;
  /** question.follower_count，问题类型质量判定用 */
  followerCount?: number;
}

export interface RawFeedTarget {
  id: string | number;
  type: string;
  title?: string;
  excerpt?: string;
  content?: string | FeedContentSegment[];
  thumbnail?: string;
  content_img?: string[];
  voteup_count?: number;
  like_count?: number;
  comment_count?: number;
  favlists_count?: number;
  favorite_count?: number;
  /** 回答类型：`NORMAL` / `PAID`；`PAID` 即知乎盐选付费内容 */
  answer_type?: string;
  /** 盐选付费信息，与 `answer_type === 'PAID'` 取或作为兜底信号 */
  paid_info?: unknown;
  /** 推荐流正文是否被截断；为 true 时不能作为完整详情复用 */
  content_need_truncated?: boolean;
  /** 推广/利益声明标记（话题流返回，推荐流通常不返回） */
  is_labeled?: boolean;
  /**
   * 以下两项仅在 target 自身即为 question 时出现（推荐流的「推荐问题」卡片）。
   * 回答/文章的问题信息在嵌套的 `question` 字段里，勿混用。
   */
  answer_count?: number;
  follower_count?: number;
  reaction?: {
    relation?: {
      liked?: boolean;
      faved?: boolean;
    };
    statistics?: {
      like_count?: number;
      favorites?: number;
    };
  };
  relationship?: {
    voting?: number;
    /** 我关注的人赞过该内容的作者 ID 列表（推荐流可返回） */
    upvoted_followee_ids?: unknown[];
  };
  author?: {
    id: string;
    name: string;
    avatar_url: string;
    headline?: string;
    url_token?: string;
    /** 机构号标记 */
    is_org?: boolean;
    /** 广告主标记 */
    is_advertiser?: boolean;
    /** 当前用户是否关注该作者 */
    is_following?: boolean;
  };
  question?: {
    id: string | number;
    title: string;
    /** 问题绑定的顶级话题 ID 列表 */
    bound_topic_ids?: number[];
    /** 问题下的回答数 */
    answer_count?: number;
    /** 问题关注数 */
    follower_count?: number;
  };
  topics?: Array<{
    id: string;
    name: string;
  }>;
  url?: string;
  detail_text?: string;
  // Hot List specific fields:
  title_area?: {
    text: string;
  };
  excerpt_area?: {
    text: string;
  };
  image_area?: {
    url: string;
  };
  metrics_area?: {
    text: string;
    font_color?: string;
    background?: string;
    weight?: string;
  };
  label_area?: {
    type: string;
    trend?: number;
    text?: string;
    night_color?: string;
    normal_color?: string;
  };
  link?: {
    url: string;
  };
}

export interface RawFeedItem {
  id?: string | number;
  type?: string;
  action_text?: string;
  target?: RawFeedTarget;
  children?: Array<{
    thumbnail?: string;
  }>;
  image_url?: string;
  detail_text?: string;
  debut?: boolean;
  // Hot List specific fields
  card_id?: string;
  card_label?: {
    type: string;
    icon: string;
    night_icon: string;
  };
  feed_specific?: {
    answer_count: number;
  };
}

export interface ZhihuFeedResponse {
  data: RawFeedItem[];
  paging: {
    is_end: boolean;
    is_start: boolean;
    next: string;
    previous: string;
  };
}

export const FEED_URLS = {
  following: 'https://www.zhihu.com/api/v3/moments?limit=10',
  recommend: 'https://www.zhihu.com/api/v3/feed/topstory/recommend?limit=10',
  local: 'zhihu://local-feed',
  hot: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50',
} as const;

export const getFeed = async (url: string): Promise<ZhihuFeedResponse> => {
  let finalUrl = url;
  const { cookies } = useAuthStore.getState();
  const isRefreshRequest = url.includes('action=up') || url.includes('t=');

  // 如果未登录且请求的是推荐页初始接口，则切换为游客接口
  if (!cookies && url.includes('feed/topstory/recommend')) {
    finalUrl =
      'https://www.zhihu.com/api/v3/explore/guest/feeds?limit=15&ws_qiangzhisafe=0';
    if (isRefreshRequest) {
      finalUrl += `&t=${Date.now()}`;
    }
  }

  if (url === 'zhihu://local-feed') {
    // 1. Fetch sections to find the local section ID
    try {
      const sectionsRes = await apiClient.get<{
        data?: Array<{ section_id?: string; section_name?: string }>;
      }>('https://api.zhihu.com/feed-root/sections/query/v2');
      const sections = sectionsRes.data?.data || [];
      const localSection = sections.find(
        (section) =>
          section.section_name?.includes('同城') || section.section_id,
      );

      if (localSection?.section_id) {
        finalUrl = `https://api.zhihu.com/feed-root/section/${localSection.section_id}?channelStyle=0`;
        if (localSection.section_name) {
          useSettingsStore
            .getState()
            .updateSettings({ localCityName: localSection.section_name });
        }
      } else {
        throw new Error('未找到同城版块');
      }
    } catch {
      console.warn('获取同城版块失败，回退到推荐流');
      finalUrl = FEED_URLS.recommend;
    }
  } else if (url.startsWith('zhihu://local-feed/')) {
    finalUrl = url.replace(
      'zhihu://local-feed/',
      'https://api.zhihu.com/feed-root/section/',
    );
  }

  const res = await apiClient.get<ZhihuFeedResponse>(finalUrl);

  if (url.startsWith('zhihu://local-feed')) {
    // Override the next URL to use our custom scheme so we can intercept it again
    if (res.data?.paging?.next) {
      res.data.paging.next = res.data.paging.next.replace(
        'https://api.zhihu.com/feed-root/section/',
        'zhihu://local-feed/',
      );
    }
  }

  return res.data;
};
