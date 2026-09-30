import type { ReactNode } from 'react';
import type { ZhihuContentSegment, ZhihuSegmentInfo } from '@/types/zhihu';
import type { RichContentVariant } from './imagePolicy';

/** 单个正文的对象类型；查询 key 使用 queryPolicy 中的复数类型。 */
export type RichContentObjectType = 'answer' | 'article' | 'pin' | 'question';

/** 用户可选择的正文后端；单个正文可通过 renderer 显式覆盖设置。 */
export type RichContentRenderer = 'rnrh' | 'webview' | 'native-v2';

/** Layout-only experiments; source text and persistent settings stay intact. */
export interface RichContentTypographyOptions {
  justify?: boolean;
  integerMeasure?: boolean;
  autoSpacing?: boolean;
  trimPunctuation?: boolean;
  lineBreak?: 'auto' | 'strict';
}

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
  renderer?: RichContentRenderer;
  /** Keep an existing preview visible while the native text completes its first layout. */
  renderPlaceholder?: () => ReactNode;
  /** Native V2 has measured its current text layout and can reveal the body. */
  onLayoutReady?: () => void;
  /** Per-surface overrides used by the development comparison page. */
  fontSizeScale?: number;
  lineHeightScale?: number;
  typographyOptions?: RichContentTypographyOptions;
  /** 跳过 WebView；用户选用 Native V2 时仍遵循其设置。 */
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
