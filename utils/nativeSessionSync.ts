interface NativeSessionOperations {
  isCurrent: (cookies: string | null, version: number) => boolean;
  clear: () => Promise<unknown>;
  setCookie: (name: string, value: string) => Promise<unknown>;
  saveLegacy: (cookies: string | null) => Promise<unknown>;
}

/** Serialized native writes cannot finish after a newer queued session. */
export function createNativeSessionSynchronizer(
  operations: NativeSessionOperations,
) {
  let pending: Promise<void> = Promise.resolve();
  return (cookies: string | null, version: number): Promise<void> => {
    const run = pending.then(async () => {
      const current = () => operations.isCurrent(cookies, version);
      if (!current()) return;
      await operations.clear();
      if (!current()) return;
      for (const pair of cookies?.split(';') ?? []) {
        const separator = pair.indexOf('=');
        if (separator <= 0) continue;
        const name = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        if (!name || !value) continue;
        await operations.setCookie(name, value);
        if (!current()) return;
      }
      await operations.saveLegacy(cookies);
    });
    pending = run.catch(() => undefined);
    return run;
  };
}
