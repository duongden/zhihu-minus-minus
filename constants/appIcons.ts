import type { AppIconName } from '@/modules/zhihu-app-icon';

export interface AppIconOption {
  color: string;
  id: AppIconName;
  label: string;
}

export const APP_ICON_OPTIONS: ReadonlyArray<AppIconOption> = [
  { id: 'default', label: '知乎蓝', color: '#0084ff' },
  { id: 'indigo', label: '极客靛', color: '#6366f1' },
  { id: 'mint', label: '薄荷青', color: '#00a896' },
  { id: 'emerald', label: '翡翠绿', color: '#10b981' },
  { id: 'sunset', label: '落日橙', color: '#f97316' },
  { id: 'sakura', label: '樱花粉', color: '#ec4899' },
  { id: 'peach', label: '蜜桃粉', color: '#ff758f' },
  { id: 'rose', label: '玫瑰红', color: '#f43f5e' },
  { id: 'violet', label: '紫罗兰', color: '#8b5cf6' },
  { id: 'slate', label: '静谧灰', color: '#64748b' },
];
