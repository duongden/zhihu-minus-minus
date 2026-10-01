import { requireOptionalNativeModule } from 'expo';

export interface ApkInspection {
  size: number;
  sha256: string;
  isZip: boolean;
}

interface PersistenceModule {
  writeAtomically(uri: string, value: string): Promise<void>;
  readAtomically(uri: string): Promise<string | null>;
  inspectApk(uri: string): Promise<ApkInspection>;
}

const nativeModule =
  requireOptionalNativeModule<PersistenceModule>('ZhihuPersistence');

/** Native replacement never removes the previous complete file before commit. */
export async function writeAtomically(
  uri: string,
  value: string,
): Promise<void> {
  if (!nativeModule) throw new Error('当前安装包不支持安全保存，请更新应用');
  await nativeModule.writeAtomically(uri, value);
}

/** Hashes in bounded native chunks, without loading a whole APK into JS. */
export async function inspectApk(uri: string): Promise<ApkInspection> {
  if (!nativeModule) throw new Error('当前安装包不支持安全校验，请更新应用');
  return nativeModule.inspectApk(uri);
}

/** Includes Android AtomicFile's interrupted-write backup recovery. */
export async function readAtomically(uri: string): Promise<string | null> {
  if (!nativeModule) throw new Error('当前安装包不支持安全读取，请更新应用');
  return nativeModule.readAtomically(uri);
}

export function isPersistenceNativeAvailable(): boolean {
  return nativeModule !== null && nativeModule !== undefined;
}
