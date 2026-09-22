export interface ZhihuTopic {
  id: string | number;
  name: string;
  type?: string;
  url?: string;
  token?: string;
  description?: string;
  avatar_path?: string;
  avatar_url?: string;
  priority?: number;
}

export interface ZhihuBadge {
  type: string;
  description: string;
  topics?: ZhihuTopic[];
}

export interface ZhihuDetailBadge {
  type?: string;
  detail_type?: string;
  title?: string;
  description?: string;
  url?: string;
  icon?: string;
  night_icon?: string;
  sources?: unknown[];
}

export interface ZhihuMergedBadge {
  type?: string;
  detail_type?: string;
  title?: string;
  description?: string;
  url?: string;
  icon?: string;
  night_icon?: string;
  sources?: unknown[];
}

export interface ZhihuBadgeV2 {
  title: string;
  icon: string;
  night_icon: string;
  detail_badges?: ZhihuDetailBadge[];
  merged_badges?: ZhihuMergedBadge[];
}

export interface ZhihuVipIcon {
  id?: number;
  night_mode_url?: string;
  url?: string;
}

export interface ZhihuVipInfo {
  is_vip?: boolean;
  vip_type?: number;
  rename_days?: string;
  entrance_v2?: null;
  rename_frequency?: number;
  rename_await_days?: number;
  target_url?: string;
  vip_icon?: ZhihuVipIcon;
  widget?: ZhihuVipIcon;
}

export interface ZhihuKvipInfo {
  is_vip: boolean;
}

export interface ZhihuAuthor {
  id: string;
  name: string;
  avatar_url: string;
  avatar_url_template?: string;
  headline?: string;
  url_token?: string;
  user_type?: string;
  type: string;
  is_org?: boolean;
  gender?: number;
  url?: string;
  is_advertiser?: boolean;
  is_privacy?: boolean;
  is_followed?: boolean;
  is_following?: boolean;
  use_default_avatar?: boolean;
  vip_info?: ZhihuVipInfo;
  kvip_info?: ZhihuKvipInfo;
  badge?: ZhihuBadge[];
  badge_v2?: ZhihuBadgeV2;
}

export interface ZhihuSegmentInfo {
  pid: string;
  text: string;
  marks: Array<{
    start_index: number;
    end_index: number;
    seg_info?: {
      like_count: number;
      comment_count: number;
      is_like: boolean;
      seg_ids?: string[] | string;
    };
    master_seg_info?: {
      like_count: number;
      comment_count: number;
      is_like: boolean;
      seg_ids?: string[] | string;
    };
  }>;
}

export interface ZhihuQuestion {
  id: string | number;
  title: string;
  created?: number;
  updated_time?: number;
  question_type?: string;
  type: 'question';
  url?: string;
  answer_count?: number;
  follow_num?: number;
  follower_count?: number;
  comment_count?: number;
  visit_count?: number;
  detail?: string;
  excerpt?: string;
  topics?: ZhihuTopic[];
  author?: ZhihuAuthor;
  relationship?: {
    voting?: number;
    is_following?: boolean;
    is_author?: boolean;
    is_anonymous?: boolean;
    is_thanked?: boolean;
    is_nothelp?: boolean;
    my_answer?: {
      id?: string | number;
      answer_id?: string | number;
      is_deleted?: boolean;
    } | null;
  };
}

export interface ZhihuReaction {
  statistics: {
    like_count: number;
    up_vote_count?: number;
    favorites?: number;
  };
  relation?: {
    faved?: boolean;
    liked?: boolean;
    vote?: 'UP' | 'DOWN' | 'NEUTRAL';
  };
}

export interface ZhihuAnswer {
  id: string | number;
  content: string;
  excerpt: string;
  created_time: number;
  updated_time: number;
  comment_count: number;
  voteup_count?: number;
  reaction_count?: number;
  reaction?: ZhihuReaction;
  author: ZhihuAuthor;
  question: {
    id: string | number;
    title: string;
    type: 'question';
  };
  type: 'answer';
  url?: string;
  relationship?: {
    voting?: number;
    is_thanked?: boolean;
  };
}

export interface ZhihuArticle {
  id: string | number;
  title: string;
  content: string;
  excerpt: string;
  created: number;
  updated: number;
  comment_count: number;
  voteup_count?: number;
  author: ZhihuAuthor;
  type: 'article';
  url?: string;
  link_card_info?: Record<string, string>;
  relationship?: {
    voting?: number;
  };
}

export interface ZhihuPin {
  id: string | number;
  content: string;
  excerpt?: string;
  created: number;
  comment_count: number;
  like_count?: number;
  reaction_count?: number;
  reaction?: ZhihuReaction;
  virtuals?: {
    is_favorited?: boolean;
    is_liked?: boolean;
  };
  author: ZhihuAuthor;
  type: 'pin';
  url?: string;
  link_card_info?: Record<string, string>;
  relationship?: {
    voting?: number;
    is_liked?: boolean;
  };
  bottom_poll?: {
    voting?: ZhihuPinPoll;
    pk?: ZhihuPinPoll;
  };
}

export interface ZhihuPinPoll {
  id: string;
  title?: string;
  max_selections?: number;
  type?: string;
  begin_at?: number;
  end_at?: number;
  voting_count?: number;
  member_count?: number;
  is_voted?: boolean;
  is_reviewing?: boolean;
  options: ZhihuPinPollOption[];
}

export interface ZhihuPinPollOption {
  id: string;
  title: string;
  voting_count?: number;
  is_selected?: boolean;
}

export interface ZhihuVideo {
  id: string | number;
  title: string;
  excerpt?: string;
  created?: number;
  comment_count?: number;
  voteup_count?: number;
  author?: ZhihuAuthor;
  type: 'zvideo' | 'video';
  url?: string;
  relationship?: {
    voting?: number;
  };
}

export type ZhihuMemberRelation =
  | ZhihuAnswer
  | ZhihuQuestion
  | ZhihuArticle
  | ZhihuPin
  | ZhihuVideo;

export interface ZhihuSearchHighlight {
  description?: string;
  title?: string;
}

export interface ZhihuColumnDetail {
  id: string;
  type: 'column';
  title: string;
  url: string;
  image_url: string;
  updated: number;
  column_type: string;
  accept_submission: boolean;
  comment_permission: string;
  intro?: string;
  excerpt?: string;
  extra?: string;
  followers?: number;
  items_count?: number;
  articles_count?: number;
  author: ZhihuAuthor;
  is_following?: boolean;
}

export interface ZhihuPaging {
  is_end: boolean;
  is_start?: boolean;
  next: string;
  previous?: string;
  totals?: number;
}

export interface ZhihuColumnItem {
  id: string | number;
  type?: 'article' | string;
  title: string;
  excerpt?: string;
  title_image?: string;
  updated?: number;
  created?: number;
  voteup_count?: number;
  comment_count?: number;
}

export interface ZhihuCollectionSummary {
  id: string | number;
  title: string;
  url?: string;
  description?: string;
  is_public?: boolean;
  type?: 'collection' | string;
  creator?: ZhihuAuthor;
  is_following?: boolean;
  follower_count?: number;
  answer_count?: number;
  item_count?: number;
  like_count?: number;
  view_count?: number;
  comment_count?: number;
  is_liking?: boolean;
  is_default?: boolean;
  created_time?: number;
  updated_time?: number;
}

export interface ZhihuCollectionContent {
  id: string | number;
  type: 'answer' | 'article' | 'pin' | 'question' | string;
  answer_type?: string;
  url?: string;
  title?: string;
  content?: string | ZhihuContentSegment[];
  excerpt?: string;
  author?: ZhihuAuthor;
  question?: ZhihuQuestion;
  thumbnail?: string;
  thumbnail_info?: {
    count?: number;
    type?: string;
    thumbnails?: Array<{ url?: string; width?: number; height?: number }>;
  };
  is_collapsed?: boolean;
  is_copyable?: boolean;
  is_visible?: boolean;
  is_normal?: boolean;
  is_mine?: boolean;
  comment_count?: number;
  voteup_count?: number;
  thanks_count?: number;
  like_count?: number;
  reaction_count?: number;
  image_count?: number;
  favlists_count?: number;
  created_time?: number;
  updated_time?: number;
  created?: number;
  updated?: number;
  comment_permission?: string;
  reshipment_settings?: string;
  suggest_edit?: {
    reason?: string;
    status?: boolean;
    tip?: string;
    title?: string;
    url?: string;
    unnormal_details?: {
      status?: string;
      description?: string;
      reason?: string;
      reason_id?: number;
      note?: string;
    };
  };
  attached_info?: string;
  relationship?: {
    is_author?: boolean;
    is_authorized?: boolean;
    is_nothelp?: boolean;
    is_thanked?: boolean;
    voting?: number;
  };
  attachment?: {
    type?: string;
    attachment_id?: string;
  };
  is_deleted?: boolean;
  virtuals?: {
    is_liked?: boolean;
    is_favorited?: boolean;
  };
}

export interface ZhihuContentSegment {
  type: string;
  content?: string;
  own_text?: string;
  fold_type?: string;
  text_link_type?: string;
  title?: string;
  data_content_id?: string;
  data_content_type?: string;
  data_draft_title?: string;
  data_draft_cover?: string;
  url?: string;
  duration?: number;
  height?: number;
  width?: number;
  is_custom_thumbnail?: boolean;
  is_long?: boolean;
  status?: string;
  thumbnail?: string;
  video_bo_id?: string;
  video_id?: string;
}

export interface ZhihuCollectionItem {
  content: ZhihuCollectionContent;
  created: string;
}

export interface ZhihuCollectionItemsResponse {
  data: ZhihuCollectionItem[];
  paging: ZhihuPaging;
}

export interface ZhihuCollectionDetailResponse {
  collection: ZhihuCollectionSummary;
  status: number;
  message: string;
}

export interface ZhihuCollectionStatusItem extends ZhihuCollectionSummary {
  is_favorited: boolean;
}

export interface ZhihuCollectionStatusResponse {
  data: ZhihuCollectionStatusItem[];
  paging?: ZhihuPaging;
}

export interface ZhihuCollectionMutationResponse {
  status?: number;
  message?: string;
  success?: boolean;
  id?: string | number;
  title?: string;
  description?: string;
  collection?: ZhihuCollectionSummary;
}

export interface ZhihuActionResponse {
  status?: number;
  message?: string;
  success?: boolean;
}

export interface ZhihuNotificationActor {
  link?: string;
  type?: string;
  url_token?: string;
  name?: string;
  avatar_url?: string;
}

export interface ZhihuNotificationTarget {
  id?: string | number;
  type?: string;
  text?: string;
  link?: string;
  title?: string;
  is_collapsed?: boolean;
  allow_reply?: boolean;
  collapsed?: boolean;
  can_collapse?: boolean;
  featured?: boolean;
  reviewing?: boolean;
  created_time?: number;
  allow_like?: boolean;
  allow_vote?: boolean;
  is_author?: boolean;
  can_recommend?: boolean;
  is_delete?: boolean;
  url?: string;
  content?: string;
  allow_delete?: boolean;
  reply_root_id?: number;
  voting?: boolean;
  resource_type?: string;
  author?: {
    member?: ZhihuAuthor;
    role?: string;
  };
  question?: {
    question_type?: string;
    title?: string;
    url?: string;
    created?: number;
    type?: string;
    id?: string | number;
    updated_time?: number;
  };
}

export interface ZhihuNotificationContent {
  verb?: string;
  actors?: ZhihuNotificationActor[];
  target?: ZhihuNotificationTarget;
  extend?: {
    text?: string;
    icon?: string;
  };
}

export interface ZhihuNotificationItem {
  id: string | number;
  type: string;
  create_time: number;
  attach_info?: string;
  merge_count?: number;
  is_read?: boolean;
  content?: ZhihuNotificationContent | string;
  actors?: ZhihuNotificationActor[];
  target?: ZhihuNotificationTarget;
}

export interface ZhihuNotificationResponse {
  data: ZhihuNotificationItem[];
  paging: ZhihuPaging;
}

export interface ZhihuSearchSuggestItem {
  query: string;
}

export interface ZhihuSearchSuggestResponse {
  suggest: ZhihuSearchSuggestItem[];
}

export interface ZhihuSearchResultObject {
  id: string | number;
  type: string;
  name?: string;
  title?: string;
  headline?: string;
  avatar_url?: string;
  url_token?: string;
  user_type?: string;
  gender?: number;
  is_org?: boolean;
  badge?: ZhihuBadge[];
  excerpt?: string;
  content?: string;
  url?: string;
  excerpt_title?: string;
  thumbnail_info?: {
    thumbnails?: Array<{ url?: string }>;
  };
  question?: {
    id?: string | number;
    title?: string;
    name?: string;
  };
  author?: ZhihuAuthor;
  relationship?: {
    voting?: number;
  };
  voteup_count?: number;
  comment_count?: number;
  follower_count?: number;
  answer_count?: number;
  is_following?: boolean;
}

export interface ZhihuSearchResultItem {
  type: 'search_result';
  highlight: ZhihuSearchHighlight;
  object: ZhihuSearchResultObject;
  index: number;
}

export interface ZhihuSearchResponse {
  paging: ZhihuPaging;
  data: ZhihuSearchResultItem[];
}

export interface ZhihuCreatorQuestionSearchResponse {
  data: ZhihuQuestion[];
  paging?: ZhihuPaging;
}

export interface ZhihuInvitationContent {
  title?: string;
  sub_title?: string;
  text?: string;
  target_link?: string;
}

export interface ZhihuInvitationQuestion extends ZhihuQuestion {
  follow_num?: number;
}

export interface ZhihuInvitationItem {
  content?: ZhihuInvitationContent;
  question?: ZhihuInvitationQuestion;
  target?: ZhihuInvitationQuestion;
  extra?: { data?: ZhihuInvitationQuestion };
  reaction?: {
    pv?: number;
    follow_num?: number;
    answer_num?: number;
  };
  target_source?: { sub_text?: string };
}

export interface ZhihuInvitationResponse {
  data: ZhihuInvitationItem[];
  paging?: ZhihuPaging;
}

export interface ZhihuTopicDetail extends ZhihuTopic {
  introduction?: string;
  questions_count?: number;
  best_answers_count?: number;
  followers_count?: number;
  is_following?: boolean;
  header_card?: string;
}

export interface ZhihuTopicFeedEnvelope {
  target: ZhihuTopicFeedTarget;
  id?: string | number;
  type?: string;
  verb?: string;
  created_time?: number;
}

export interface ZhihuTopicFeedTarget {
  id: string | number;
  type: 'answer' | 'article' | 'pin' | 'question' | string;
  title?: string;
  excerpt?: string;
  excerpt_title?: string;
  thumbnail?: string;
  topic_thumbnails?: string[];
  content_img?: string[];
  content?: Array<{ type?: string; content?: string; url?: string }>;
  question?: { id?: string | number; title?: string };
  author?: ZhihuAuthor;
  comment_count?: number;
  voteup_count?: number;
  relationship?: { voting?: number; is_author?: boolean };
}

export type ZhihuTopicFeedItem = ZhihuTopicFeedTarget | ZhihuTopicFeedEnvelope;

export interface ZhihuTopicFeedResponse {
  data: ZhihuTopicFeedItem[];
  paging: ZhihuPaging;
}

export interface ZhihuTopicStructureResponse {
  data: ZhihuTopic[];
}

export interface ZhihuBestAnswerer {
  member: ZhihuAuthor;
  answer_count: number;
  answer_votes: number;
}

export interface ZhihuBestAnswerersResponse {
  data: ZhihuBestAnswerer[];
}
