import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ReadingProgressEntry } from '@/utils/readingProgress';

// 适配器：让 Zustand 能用上 Expo 的安全存储
const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) =>
    SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

interface ProgressState {
  progress: Record<string, ReadingProgressEntry>;
  saveProgress: (id: string, entry: ReadingProgressEntry) => void;
  removeProgress: (id: string) => void;
  getProgress: (id: string) => ReadingProgressEntry | undefined;
  clearProgress: () => void;
}

const MAX_PROGRESS_ENTRIES = 100;

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      progress: {},

      saveProgress: (id, entry) => {
        if (!id) return;
        const { progress } = get();
        const newProgress = {
          ...progress,
          [id]: entry,
        };

        // 限制存储条数：保留最近更新的 100 条
        const keys = Object.keys(newProgress);
        if (keys.length > MAX_PROGRESS_ENTRIES) {
          const sortedKeys = keys.sort(
            (a, b) => newProgress[b].updatedAt - newProgress[a].updatedAt,
          );
          const keysToRemove = sortedKeys.slice(MAX_PROGRESS_ENTRIES);
          for (const key of keysToRemove) {
            delete newProgress[key];
          }
        }

        set({ progress: newProgress });
      },

      removeProgress: (id) => {
        if (!id || !get().progress[id]) return;
        const nextProgress = { ...get().progress };
        delete nextProgress[id];
        set({ progress: nextProgress });
      },

      getProgress: (id) => {
        if (!id) return undefined;
        return get().progress[id];
      },

      clearProgress: () => set({ progress: {} }),
    }),
    {
      name: 'progress-storage',
      storage: createJSONStorage(() => secureStorage),
    },
  ),
);
