import { requireOptionalNativeModule } from 'expo';

export type AppIconName =
  | 'default'
  | 'indigo'
  | 'mint'
  | 'emerald'
  | 'sunset'
  | 'sakura'
  | 'peach'
  | 'rose'
  | 'violet'
  | 'slate'
  | 'aurora'
  | 'rainbow';

interface AppIconNativeModule {
  getAppIcon(): Promise<AppIconName>;
  isSupported(): Promise<boolean>;
  setAppIcon(iconName: AppIconName): Promise<AppIconName>;
}

const nativeModule =
  requireOptionalNativeModule<AppIconNativeModule>('ZhihuAppIcon');

export const isAppIconSupported = () =>
  nativeModule?.isSupported() ?? Promise.resolve(false);

export const getAppIcon = () =>
  nativeModule?.getAppIcon() ?? Promise.resolve<AppIconName>('default');

export async function setAppIcon(iconName: AppIconName) {
  if (!nativeModule) {
    throw new Error('当前安装包不包含 App 图标切换功能。');
  }
  return nativeModule.setAppIcon(iconName);
}
