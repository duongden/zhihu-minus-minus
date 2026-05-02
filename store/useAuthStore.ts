import * as FileSystem from 'expo-file-system';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// 适配器：使用 Expo FileSystem 代替 SecureStore 存储大数据
// Android SecureStore 有 2048 字节的硬限制，存储多个账号信息时极易导致崩溃
const AUTH_STORAGE_PATH = `${FileSystem.documentDirectory}auth-storage.json`;

const fileStorage = {
  getItem: async (name: string) => {
    try {
      const info = await FileSystem.getInfoAsync(AUTH_STORAGE_PATH);
      if (info.exists) {
        return await FileSystem.readAsStringAsync(AUTH_STORAGE_PATH);
      }
      return null;
    } catch (e) {
      console.error('读取存储失败:', e);
      return null;
    }
  },
  setItem: async (name: string, value: string) => {
    try {
      await FileSystem.writeAsStringAsync(AUTH_STORAGE_PATH, value);
    } catch (e) {
      console.error('写入存储失败:', e);
    }
  },
  removeItem: async (name: string) => {
    try {
      await FileSystem.deleteAsync(AUTH_STORAGE_PATH, { idempotent: true });
    } catch (e) {
      console.error('删除存储失败:', e);
    }
  },
};

export interface Account {
  cookies: string;
  me: any;
  last_updated?: number; // 添加更新时间戳
}

interface AuthState {
  accounts: Account[];
  activeAccountIndex: number;
  cookies: string | null;
  me: any | null; // 存储个人详细信息
  setCookies: (cookies: string) => void;
  setMe: (me: any) => void;
  addAccount: (cookies: string, me: any) => void;
  switchAccount: (index: number) => void;
  removeAccount: (index: number) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accounts: [],
      activeAccountIndex: -1,
      cookies: null,
      me: null,

      setCookies: (cookies) => {
        const { accounts, activeAccountIndex } = get();
        if (activeAccountIndex >= 0) {
          const newAccounts = [...accounts];
          newAccounts[activeAccountIndex] = {
            ...newAccounts[activeAccountIndex],
            cookies,
          };
          set({ accounts: newAccounts, cookies });
        } else {
          set({ cookies });
        }
      },

      setMe: (me) => {
        const { accounts, activeAccountIndex } = get();
        if (activeAccountIndex >= 0) {
          const newAccounts = [...accounts];
          newAccounts[activeAccountIndex] = {
            ...newAccounts[activeAccountIndex],
            me,
          };
          set({ accounts: newAccounts, me });
        } else {
          set({ me });
        }
      },

      addAccount: (cookies, me) => {
        const { accounts } = get();
        // 优先使用不可变的 id，后退到 url_token 或 name
        const id = me?.id || me?.url_token || me?.name;
        const existingIndex = accounts.findIndex(
          (a) => (a.me?.id || a.me?.url_token || a.me?.name) === id,
        );

        const last_updated = Date.now();

        if (existingIndex >= 0) {
          const newAccounts = [...accounts];
          newAccounts[existingIndex] = { cookies, me, last_updated };
          set({
            accounts: newAccounts,
            activeAccountIndex: existingIndex,
            cookies,
            me,
          });
        } else {
          const newAccounts = [...accounts, { cookies, me, last_updated }];
          set({
            accounts: newAccounts,
            activeAccountIndex: newAccounts.length - 1,
            cookies,
            me,
          });
        }
      },

      switchAccount: (index) => {
        const { accounts } = get();
        if (index >= 0 && index < accounts.length) {
          const account = accounts[index];
          set({
            activeAccountIndex: index,
            cookies: account.cookies,
            me: account.me,
          });
        }
      },

      removeAccount: (index) => {
        const { accounts, activeAccountIndex } = get();
        if (index >= 0 && index < accounts.length) {
          const newAccounts = accounts.filter((_, i) => i !== index);
          let newIndex = activeAccountIndex;
          if (activeAccountIndex === index) {
            newIndex = newAccounts.length > 0 ? 0 : -1;
          } else if (activeAccountIndex > index) {
            newIndex -= 1;
          }

          const activeAccount = newIndex >= 0 ? newAccounts[newIndex] : null;
          set({
            accounts: newAccounts,
            activeAccountIndex: newIndex,
            cookies: activeAccount?.cookies || null,
            me: activeAccount?.me || null,
          });
        }
      },

      logout: () => {
        const { accounts, activeAccountIndex } = get();
        if (activeAccountIndex >= 0) {
          const newAccounts = accounts.filter(
            (_, i) => i !== activeAccountIndex,
          );
          const newIndex = newAccounts.length > 0 ? 0 : -1;
          const activeAccount = newIndex >= 0 ? newAccounts[newIndex] : null;
          set({
            accounts: newAccounts,
            activeAccountIndex: newIndex,
            cookies: activeAccount?.cookies || null,
            me: activeAccount?.me || null,
          });
        } else {
          set({
            accounts: [],
            activeAccountIndex: -1,
            cookies: null,
            me: null,
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => fileStorage),
      version: 2, // 升级版本以支持 last_updated 结构（虽然是可选的）
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          const state = persistedState as any;
          if (state.cookies && state.me) {
            return {
              ...state,
              accounts: [{ cookies: state.cookies, me: state.me }],
              activeAccountIndex: 0,
            };
          }
          return {
            ...state,
            accounts: [],
            activeAccountIndex: -1,
          };
        }
        if (version === 1) {
          // v1 -> v2: 主要是增加了 last_updated，现有数据继续使用即可
          return persistedState;
        }
        return persistedState;
      },
    },
  ),
);
