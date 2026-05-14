import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

const settingsStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

export type TabKey = 'following' | 'recommend' | 'hot' | 'daily' | 'publish' | 'profile';

export interface AppSettings {
  fontSizeScale: number;
  lineHeightScale: number;
  primaryColor: string | null;
  visibleTabs: TabKey[];
  defaultTab: TabKey;
  borderRadius: number;
  useWebView: boolean;
}

interface SettingsState extends AppSettings {
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  fontSizeScale: 1.0,
  lineHeightScale: 1.5,
  primaryColor: null, // null means use system default
  visibleTabs: ['following', 'recommend', 'hot', 'daily', 'publish', 'profile'],
  defaultTab: 'recommend',
  borderRadius: 12,
  useWebView: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      updateSettings: (newSettings) => set((state) => {
        const nextSettings = { ...state, ...newSettings };
        // 兜底：确保“我的”页面始终可见
        if (nextSettings.visibleTabs && !nextSettings.visibleTabs.includes('profile')) {
          nextSettings.visibleTabs = [...nextSettings.visibleTabs, 'profile'];
        }
        return nextSettings;
      }),
      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'zhihu-settings-storage',
      storage: createJSONStorage(() => settingsStorage),
    }
  )
);
