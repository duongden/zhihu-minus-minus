import type { ZhihuContentSegment, ZhihuSegmentInfo } from '@/types/zhihu';
import type { RichContentVariant } from './imagePolicy';
import type { EnrichedNormalizationResult } from './normalization/normalizeZhihuHtml';

/** 单个正文的对象类型；查询 key 使用 queryPolicy 中的复数类型。 */
export type RichContentObjectType = 'answer' | 'article' | 'pin' | 'question';

/** Enriched 是开发案例页使用的实验后端，业务页仍沿用原有默认选择。 */
export type RichContentRenderer = 'rnrh' | 'webview' | 'enriched';

export interface ZhihuContentProps {
  /** 回答、文章和问题等接口返回的 HTML，尚未规范化为 ZhihuDocument。 */
  content?: string;
  /** 想法接口返回的分段结构，与收藏、Feed 共用领域类型。 */
  contentArray?: readonly ZhihuContentSegment[];
  segmentInfos?: readonly ZhihuSegmentInfo[];
  /** 卡片值可能是 JSON 字符串或对象，必须在使用时验证字段。 */
  linkCardInfo?: Readonly<Record<string, unknown>>;
  objectId: string;
  type: RichContentObjectType;
  onRefresh?: () => void;
  onEnrichedNormalized?: (result: EnrichedNormalizationResult) => void;
  renderer?: RichContentRenderer;
  useNative?: boolean;
  selectable?: boolean;
  variant?: RichContentVariant;
}

export interface LinkCardProps {
  url: string;
  title?: string;
  image?: string;
  /** 知乎原始卡片元数据，不能直接视为规范化后的展示结构。 */
  cardInfo?: unknown;
  onPress: (url: string) => void;
  surfaceColor: string;
  colorScheme: 'light' | 'dark';
}
