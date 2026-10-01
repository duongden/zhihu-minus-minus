import { createNativeSessionSynchronizer } from '../utils/nativeSessionSync';

test('a newer session waits for an in-flight write and leaves only its native cookies', async () => {
  let version = 1;
  let cookie: string | null = 'z_c0=synthetic-a; d_c0=synthetic-device';
  const jar = new Map<string, string>();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const saveLegacy = jest.fn(async () => {});
  const setCookie = jest.fn(async (name: string, value: string) => {
    await gate;
    jar.set(name, value);
  });
  const sync = createNativeSessionSynchronizer({
    isCurrent: (expectedCookie, expectedVersion) =>
      cookie === expectedCookie && version === expectedVersion,
    clear: async () => {
      jar.clear();
    },
    setCookie,
    saveLegacy,
  });
  const old = sync(cookie, version);
  // Drive the first write into its asynchronous native boundary.
  await Promise.resolve();
  await Promise.resolve();
  expect(setCookie).toHaveBeenCalledTimes(1);
  version = 2;
  cookie = null;
  const current = sync(cookie, version);
  release();
  await old;
  await current;
  expect(jar.size).toBe(0);
  expect(setCookie).toHaveBeenCalledTimes(1);
  expect(saveLegacy).toHaveBeenCalledTimes(1);
  expect(saveLegacy).toHaveBeenLastCalledWith(null);
});

test('a rejected native operation does not block the next session or replay old work', async () => {
  let version = 1;
  const clear = jest
    .fn()
    .mockRejectedValueOnce(new Error('synthetic failure'))
    .mockResolvedValue(undefined);
  const sync = createNativeSessionSynchronizer({
    isCurrent: (_, expected) => version === expected,
    clear,
    setCookie: jest.fn(),
    saveLegacy: jest.fn(async () => {}),
  });
  await expect(sync('z_c0=synthetic', 1)).rejects.toThrow('synthetic failure');
  version = 2;
  await sync(null, 2);
  expect(clear).toHaveBeenCalledTimes(2);
  await sync('z_c0=synthetic', 1);
  expect(clear).toHaveBeenCalledTimes(2);
});
