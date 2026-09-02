import CookieManager from '@preeternal/react-native-cookie-manager';
import * as SecureStore from 'expo-secure-store';

export const LEGACY_COOKIE_STORAGE_KEY = 'user_cookies';
const SECURE_STORE_SAFE_COOKIE_LENGTH = 2000;

function parseCookieString(cookieString: string) {
  return cookieString
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .flatMap((pair) => {
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex <= 0) return [];
      const name = pair.slice(0, separatorIndex);
      const value = pair.slice(separatorIndex + 1);
      return name && value ? [{ name, value }] : [];
    });
}

/**
 * Keep the native cookie jar and the legacy SecureStore backup aligned.
 * The Zustand file store remains the source of truth for active-account state.
 */
export async function syncNativeSessionCookies(cookieString: string | null) {
  await CookieManager.clearAllStores();

  if (!cookieString) {
    await SecureStore.deleteItemAsync(LEGACY_COOKIE_STORAGE_KEY);
    return;
  }

  for (const cookie of parseCookieString(cookieString)) {
    await CookieManager.set(
      'https://www.zhihu.com',
      {
        ...cookie,
        domain: '.zhihu.com',
        path: '/',
        secure: true,
      },
      true,
    );
  }

  if (cookieString.length < SECURE_STORE_SAFE_COOKIE_LENGTH) {
    await SecureStore.setItemAsync(LEGACY_COOKIE_STORAGE_KEY, cookieString);
  } else {
    // Never leave a previous account's short cookie as a fallback.
    await SecureStore.deleteItemAsync(LEGACY_COOKIE_STORAGE_KEY);
  }
}
