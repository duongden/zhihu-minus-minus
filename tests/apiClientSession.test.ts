import axios, {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import apiClient, {
  hasAuthenticationCookie,
  mergeCookieHeader,
} from '../api/client';
import type { ZhihuMeInfo } from '../api/zhihu/me';
import { readAtomically } from '../modules/zhihu-persistence';
import {
  getAuthSessionVersion,
  saveAuthState,
  useAuthStore,
} from '../store/useAuthStore';
import { useCollectionStore } from '../store/useCollectionStore';

jest.mock('@preeternal/react-native-cookie-manager', () => ({
  __esModule: true,
  default: { get: jest.fn(async () => ({})) },
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  readAsStringAsync: jest.fn(
    async (path: string) =>
      mockAuthFiles.get(path) ?? JSON.stringify({ state: {}, version: 2 }),
  ),
  writeAsStringAsync: jest.fn(async (path: string, value: string) => {
    mockAuthFiles.set(path, value);
  }),
  deleteAsync: jest.fn(async () => undefined),
}));
// Persistence cryptography/native filesystem have dedicated tests; these
// session tests use an in-memory bridge rather than an unavailable device.
const mockAuthFiles = new Map<string, string>();
jest.mock('../storage/authEncryption', () => ({
  encryptAuthState: async (value: string) =>
    Buffer.from(value).toString('base64'),
  decryptAuthState: async (value: string) =>
    Buffer.from(value, 'base64').toString(),
  resetAuthEncryptionKey: jest.fn(),
}));
jest.mock('../modules/zhihu-persistence', () => ({
  readAtomically: jest.fn(
    async (path: string) =>
      mockAuthFiles.get(path) ?? JSON.stringify({ state: {}, version: 2 }),
  ),
  writeAtomically: async (path: string, value: string) => {
    mockAuthFiles.set(path, value);
  },
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
}));
jest.mock('../storage/localAccountData', () => ({
  clearLocalAccountData: jest.fn(async () => undefined),
}));
jest.mock('../api/zse96/index', () => ({
  ZSE_VERSION: 'test',
  signRequest96: jest.fn(async () => 'test-signature'),
  hmacSha1Hex: jest.fn(() => 'test-hmac'),
  encryptZseV4: jest.fn((value: string) => value),
}));

// Every credential and profile in this file is synthetic.
const COOKIE_A = 'z_c0=test-account-a';
const COOKIE_B = 'z_c0=test-account-b';
const PROFILE_A = { id: 'test-a', name: 'Test A' } as ZhihuMeInfo;
const PROFILE_B = { id: 'test-b', name: 'Test B' } as ZhihuMeInfo;
const originalAdapter = apiClient.defaults.adapter;

function response(
  config: InternalAxiosRequestConfig,
  data: unknown = {},
  headers: Record<string, string> = {},
): AxiosResponse<unknown> {
  return { config, data, headers, status: 200, statusText: 'OK' };
}

function unauthorized(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
    ...response(config),
    status: 401,
    statusText: 'Unauthorized',
  });
}

beforeEach(async () => {
  await useAuthStore.persist.rehydrate();
  useAuthStore.setState({
    accounts: [],
    activeAccountIndex: -1,
    cookies: null,
    me: null,
  });
  useAuthStore.getState().addAccount(COOKIE_A, PROFILE_A);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

test('a delayed rehydrate cannot replace a newer login or discard saved accounts', async () => {
  expect(await saveAuthState()).toBe(true);
  const previousSnapshot = mockAuthFiles.get('file:///test/auth-storage.json');
  expect(previousSnapshot).toBeDefined();
  let releaseRead: (value: string | null) => void = () => {};
  let startRead: () => void = () => {};
  const reading = new Promise<void>((resolve) => {
    startRead = resolve;
  });
  jest.mocked(readAtomically).mockImplementationOnce(() => {
    startRead();
    return new Promise((resolve) => {
      releaseRead = resolve;
    });
  });
  const restoring = useAuthStore.persist.rehydrate();
  await reading;
  useAuthStore.getState().setCookies(COOKIE_B);
  useAuthStore.getState().addAccount(COOKIE_B, PROFILE_B);
  releaseRead(previousSnapshot ?? null);
  await restoring;
  expect(useAuthStore.getState()).toMatchObject({
    cookies: COOKIE_B,
    me: PROFILE_B,
    accounts: [{ me: PROFILE_A }, { me: PROFILE_B }],
  });
  expect(await saveAuthState()).toBe(true);
  await useAuthStore.persist.rehydrate();
  expect(useAuthStore.getState()).toMatchObject({
    cookies: COOKIE_B,
    accounts: [{ me: PROFILE_A }, { me: PROFILE_B }],
  });
});

test('startup blocks new login until the existing accounts have been restored', async () => {
  expect(await saveAuthState()).toBe(true);
  const previousSnapshot = mockAuthFiles.get('file:///test/auth-storage.json');
  let releaseRead: (value: string | null) => void = () => {};
  let startRead: () => void = () => {};
  const reading = new Promise<void>((resolve) => {
    startRead = resolve;
  });
  jest.mocked(readAtomically).mockImplementationOnce(() => {
    startRead();
    return new Promise((resolve) => {
      releaseRead = resolve;
    });
  });
  const modules: { auth?: typeof import('../store/useAuthStore') } = {};
  jest.isolateModules(() => {
    modules.auth = jest.requireActual<typeof import('../store/useAuthStore')>(
      '../store/useAuthStore',
    );
  });
  // The native bridge mock is shared across module instances.
  await reading;
  const isolated = modules.auth;
  if (!isolated) throw new Error('隔离账号模块未加载');
  const freshStore = isolated.useAuthStore;
  expect(() => freshStore.getState().setCookies(COOKIE_B)).toThrow(
    '请先恢复已保存账号',
  );
  expect(() => freshStore.getState().addAccount(COOKIE_B, PROFILE_B)).toThrow(
    '请先恢复已保存账号',
  );
  const restored = new Promise<void>((resolve) => {
    const stop = freshStore.persist.onFinishHydration(() => {
      stop();
      resolve();
    });
  });
  releaseRead(previousSnapshot ?? null);
  await restored;
  freshStore.getState().setCookies(COOKIE_B);
  freshStore.getState().addAccount(COOKIE_B, PROFILE_B);
  expect(await isolated.saveAuthState()).toBe(true);
  expect(freshStore.getState()).toMatchObject({
    cookies: COOKIE_B,
    accounts: [{ me: PROFILE_A }, { me: PROFILE_B }],
  });
});

test('rehydration verifies the session again after JSON decoding and before merge', async () => {
  expect(await saveAuthState()).toBe(true);
  const encrypted = mockAuthFiles.get('file:///test/auth-storage.json');
  if (!encrypted) throw new Error('测试账号未保存');
  const originalParse = JSON.parse;
  const previousSnapshot = Buffer.from(
    originalParse(encrypted).data,
    'base64',
  ).toString();
  let decoded = 0;
  const parser = jest
    .spyOn(JSON, 'parse')
    .mockImplementation((text, reviver) => {
      const value = originalParse(text, reviver);
      if (text === previousSnapshot && ++decoded === 2) {
        // First parse validates decrypted storage; the second belongs to
        // createJSONStorage, after the file adapter's generation check.
        useAuthStore.getState().setCookies(COOKIE_B);
        useAuthStore.getState().addAccount(COOKIE_B, PROFILE_B);
      }
      return value;
    });
  await useAuthStore.persist.rehydrate();
  parser.mockRestore();
  expect(decoded).toBe(2);
  expect(useAuthStore.getState()).toMatchObject({
    cookies: COOKIE_B,
    accounts: [{ me: PROFILE_A }, { me: PROFILE_B }],
  });
  expect(await saveAuthState()).toBe(true);
});

test('limits a request to one refresh even though Axios clones retry config', async () => {
  const refreshClient = axios.create();
  const refreshAdapter = jest.fn(async (config: InternalAxiosRequestConfig) =>
    response(
      config,
      config.url?.includes('token/refresh')
        ? { refresh_token: 'test-refresh-token' }
        : {},
    ),
  );
  refreshClient.defaults.adapter = refreshAdapter;
  jest.spyOn(axios, 'create').mockReturnValue(refreshClient);
  let attempts = 0;
  apiClient.defaults.adapter = async (config) => {
    attempts += 1;
    if (attempts <= 2) throw unauthorized(config);
    return response(config);
  };

  await expect(apiClient.get('/test-session')).rejects.toMatchObject({
    response: { status: 401 },
  });
  expect(attempts).toBe(2);
  expect(refreshAdapter).toHaveBeenCalledTimes(2);
});

test.each([
  'guest',
  'logout',
] as const)('ignores an old response after switching to %s', async (change) => {
  let finish: (() => void) | undefined;
  let started: (() => void) | undefined;
  const adapterStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  apiClient.defaults.adapter = (config) => {
    started?.();
    return new Promise((resolve) => {
      finish = () =>
        resolve(
          response(
            config,
            {},
            {
              'set-cookie': 'z_c0=test-old-response; Path=/',
            },
          ),
        );
    });
  };
  const pending = apiClient.get('/test-session');
  const rejected = expect(pending).rejects.toMatchObject({
    code: 'ERR_CANCELED',
  });
  await adapterStarted;
  if (change === 'guest') useAuthStore.getState().switchAccount(-1);
  else useAuthStore.getState().logout();
  finish?.();
  await rejected;
  expect(useAuthStore.getState().cookies).toBeNull();
});

test('a new login cannot write its response cookies into a saved account', () => {
  useAuthStore.getState().setCookies(COOKIE_B);
  useAuthStore.getState().updateActiveAccountCookies('z_c0=test-b-rotated');
  const state = useAuthStore.getState();
  expect(state.activeAccountIndex).toBe(-1);
  expect(state.me).toBeNull();
  expect(state.accounts[0].cookies).toBe(COOKIE_A);
  useAuthStore.getState().addAccount(COOKIE_B, PROFILE_B);
  expect(useAuthStore.getState().accounts).toHaveLength(2);
});

test('logging out an unverified new session preserves and restores saved accounts', () => {
  useAuthStore.getState().setCookies(COOKIE_B);
  useAuthStore.getState().logout();
  expect(useAuthStore.getState()).toMatchObject({
    accounts: [{ cookies: COOKIE_A, me: PROFILE_A }],
    activeAccountIndex: 0,
    cookies: COOKIE_A,
    me: PROFILE_A,
  });
});

test('removing a saved account preserves an unverified current session and its in-flight response', async () => {
  useAuthStore.getState().setCookies(COOKIE_B);
  let finish: (() => void) | undefined;
  let started: (() => void) | undefined;
  const adapterStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  apiClient.defaults.adapter = (config) => {
    started?.();
    return new Promise((resolve) => {
      finish = () =>
        resolve(
          response(config, {}, { 'set-cookie': 'z_c0=test-b-rotated; Path=/' }),
        );
    });
  };
  const pending = apiClient.get('/test-unverified-session');
  await adapterStarted;
  const sessionVersion = getAuthSessionVersion();
  useAuthStore.getState().removeAccount(0);
  expect(useAuthStore.getState()).toMatchObject({
    accounts: [],
    activeAccountIndex: -1,
    cookies: COOKIE_B,
    me: null,
  });
  expect(getAuthSessionVersion()).toBe(sessionVersion);
  finish?.();
  await pending;
  expect(useAuthStore.getState().cookies).toBe('z_c0=test-b-rotated');
  expect(useAuthStore.getState().accounts).toEqual([]);
});

test('removing the last active account clears and advances the current session', () => {
  const sessionVersion = getAuthSessionVersion();
  useAuthStore.getState().removeAccount(0);
  expect(useAuthStore.getState()).toMatchObject({
    accounts: [],
    activeAccountIndex: -1,
    cookies: null,
    me: null,
  });
  expect(getAuthSessionVersion()).toBeGreaterThan(sessionVersion);
});

test('honors cookie deletion attributes and rejects empty auth tokens', () => {
  expect(hasAuthenticationCookie('z_c0=; d_c0=test')).toBe(false);
  expect(mergeCookieHeader(COOKIE_A, ['z_c0=deleted; Max-Age=0'])).toBe('');
  expect(
    mergeCookieHeader(COOKIE_A, [
      'z_c0=deleted; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ]),
  ).toBe('');
  expect(
    mergeCookieHeader(COOKIE_A, [
      'z_c0=test-live; Max-Age=3600; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ]),
  ).toBe('z_c0=test-live');
});

test.each([
  'guest',
  'logout',
  'new-login',
] as const)('clears transient collection state on %s session changes', (change) => {
  const collections = useCollectionStore.getState();
  collections.setCollectedStatus('synthetic-content', true);
  collections.updateCollectedCountOffset('synthetic-content', 1);
  collections.showToast('synthetic-content', 'answer', 'test');
  collections.openSelector('synthetic-content', 'answer');
  if (change === 'guest') useAuthStore.getState().switchAccount(-1);
  else if (change === 'logout') useAuthStore.getState().logout();
  else useAuthStore.getState().setCookies(COOKIE_B);
  expect(useCollectionStore.getState()).toMatchObject({
    collectedStatusMap: {},
    collectedCountOffsetMap: {},
    toastVisible: false,
    selectorVisible: false,
    selectorContentId: null,
  });
});

test('anonymous response cookies do not convert a guest into an authenticated store session', async () => {
  useAuthStore.getState().switchAccount(-1);
  apiClient.defaults.adapter = async (config) =>
    response(
      config,
      {},
      {
        'set-cookie': 'd_c0=test-guest; Path=/',
      },
    );
  await apiClient.get('/test-guest');
  expect(useAuthStore.getState().cookies).toBeNull();
});

test('clears the active auth session when z_c0 is deleted but anonymous cookies remain', async () => {
  apiClient.defaults.adapter = async (config) =>
    response(
      config,
      {},
      {
        'set-cookie': 'z_c0=deleted; Max-Age=0, d_c0=test-guest; Path=/',
      },
    );
  await apiClient.get('/test-session-deletion');
  expect(useAuthStore.getState().cookies).toBe('');
  expect(useAuthStore.getState().accounts[0].cookies).toBe('');
});
