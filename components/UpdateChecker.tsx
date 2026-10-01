import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  getGithubReleaseHistory,
  getLatestGithubRelease,
} from '@/api/githubReleases';
import { MarkdownText } from '@/components/MarkdownText';
import { AppDialog } from '@/components/overlays/AppDialog';
import { Text, useRuntimeThemeColors } from '@/components/Themed';
import { showToast } from '@/utils/toast';
import {
  cleanupUpdatePartials,
  downloadAndInstallVerifiedApk,
} from '@/utils/updateDownload';
import {
  assertUpdateActive,
  type GithubReleaseAsset,
  isTrustedReleaseUrl,
  MAX_CHECKSUM_BYTES,
  UpdateFailure,
} from '@/utils/updateSecurity';
import { isVersionNewer, selectAndroidApk } from '@/utils/updateSelection';

const IGNORED_VERSION_KEY = 'ignored_version_tag';

export interface ReleaseHistoryItem {
  name: string;
  notes: string;
  prerelease: boolean;
  publishedAt: string | null;
  tag: string;
  url: string;
}

export interface UpdateInfo {
  apkUrl?: string;
  apkAsset?: GithubReleaseAsset;
  checksumAsset?: GithubReleaseAsset;
  currentVersion: string;
  latestVersion: string;
  latestVersionTag: string;
  releaseNotes: string;
  releaseUrl: string;
  updateAvailable: boolean;
}

export async function getUpdateInfo(options?: {
  signal?: AbortSignal;
}): Promise<UpdateInfo> {
  const data = await getLatestGithubRelease(options);
  const latestVersion = data.tag.slice(1);
  const currentVersion =
    Constants.expoConfig?.version || Constants.nativeAppVersion || '0.0.0';
  const selected =
    Platform.OS === 'android'
      ? selectAndroidApk(data.assets, Device.supportedCpuArchitectures)
      : undefined;
  const checksumAsset = data.assets.find(
    (asset) =>
      asset.name === 'SHA256SUMS.txt' && asset.size <= MAX_CHECKSUM_BYTES,
  );
  // Old releases without a verifiable digest remain available in the browser.
  const apkAsset =
    selected && (selected.sha256 || checksumAsset) ? selected : undefined;
  return {
    apkUrl: apkAsset?.browser_download_url,
    apkAsset,
    checksumAsset,
    currentVersion,
    latestVersion,
    latestVersionTag: data.tag,
    releaseNotes: data.notes || '无更新说明',
    releaseUrl: data.url,
    updateAvailable: isVersionNewer(latestVersion, currentVersion),
  };
}

export async function getReleaseHistory(options?: {
  signal?: AbortSignal;
}): Promise<ReleaseHistoryItem[]> {
  return (await getGithubReleaseHistory(options)).map(
    ({ assets: _assets, ...release }) => release,
  );
}

export const useCheckUpdate = (
  onUpdateAvailable?: (info: UpdateInfo) => void,
) => {
  const onUpdateAvailableRef = useRef(onUpdateAvailable);
  onUpdateAvailableRef.current = onUpdateAvailable;
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const updateInfo = await getUpdateInfo({ signal: controller.signal });
          assertUpdateActive(controller.signal);
          if (!updateInfo.updateAvailable) return;
          const ignored = await SecureStore.getItemAsync(IGNORED_VERSION_KEY);
          assertUpdateActive(controller.signal);
          if (ignored !== updateInfo.latestVersionTag)
            onUpdateAvailableRef.current?.(updateInfo);
        } catch (error) {
          if (!(error instanceof UpdateFailure && error.code === 'cancelled'))
            console.warn('检查更新失败');
        }
      })();
    }, 2000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
};

export const UpdateChecker: React.FC = () => {
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<UpdateInfo | null>(null);
  const downloadRef = useRef<AbortController | null>(null);
  const cleanupRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const { primary: primaryColor } = useRuntimeThemeColors();
  useCheckUpdate(setPendingUpdate);

  useEffect(() => {
    mountedRef.current = true;
    cleanupRef.current = cleanupUpdatePartials().catch(() =>
      console.warn('清理更新临时文件失败'),
    );
    return () => {
      mountedRef.current = false;
      downloadRef.current?.abort();
    };
  }, []);

  if (!isDownloading && !pendingUpdate) return null;
  const closeUpdate = () => setPendingUpdate(null);
  const ignoreUpdate = async () => {
    if (!pendingUpdate) return;
    const versionTag = pendingUpdate.latestVersionTag;
    setPendingUpdate(null);
    await SecureStore.setItemAsync(IGNORED_VERSION_KEY, versionTag).catch(() =>
      showToast('无法保存忽略的版本'),
    );
  };
  const openRelease = () => {
    if (!pendingUpdate) return;
    const { releaseUrl, latestVersionTag } = pendingUpdate;
    if (!isTrustedReleaseUrl(releaseUrl, latestVersionTag)) {
      showToast('版本页面地址无效');
      return;
    }
    setPendingUpdate(null);
    const opening =
      Platform.OS === 'android'
        ? WebBrowser.openBrowserAsync(releaseUrl)
        : Linking.openURL(releaseUrl);
    void opening.catch(() => showToast('无法打开 GitHub 版本页面'));
  };
  const startDownload = () => {
    if (!pendingUpdate?.apkAsset || downloadRef.current) return;
    const info = pendingUpdate;
    const asset = pendingUpdate.apkAsset;
    const controller = new AbortController();
    downloadRef.current = controller;
    setPendingUpdate(null);
    setDownloadProgress(0);
    setIsDownloading(true);
    void cleanupRef.current
      .then(() => {
        assertUpdateActive(controller.signal);
        return downloadAndInstallVerifiedApk(
          {
            tag: info.latestVersionTag,
            asset,
            checksumAsset: info.checksumAsset,
          },
          {
            signal: controller.signal,
            onProgress: (fraction) => {
              if (
                mountedRef.current &&
                downloadRef.current === controller &&
                !controller.signal.aborted
              )
                setDownloadProgress(fraction);
            },
          },
        );
      })
      .catch((error: unknown) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        showToast(
          error instanceof UpdateFailure ? error.message : '更新失败，请重试',
        );
        setPendingUpdate(info);
      })
      .finally(() => {
        if (downloadRef.current !== controller) return;
        downloadRef.current = null;
        if (mountedRef.current) setIsDownloading(false);
      });
  };

  return (
    <>
      {pendingUpdate ? (
        <AppDialog
          visible
          title={`发现新版本 ${pendingUpdate.latestVersionTag}`}
          icon="cloud-download-outline"
          message="有新的版本可用"
          onClose={closeUpdate}
          actions={[
            { label: '稍后', onPress: closeUpdate },
            {
              label: '忽略此版本',
              onPress: () => void ignoreUpdate(),
              variant: 'destructive',
            },
            ...(pendingUpdate.apkAsset
              ? [
                  {
                    label: '直接更新',
                    onPress: startDownload,
                    variant: 'primary' as const,
                  },
                ]
              : []),
            {
              label: '去下载（GitHub）',
              onPress: openRelease,
              variant: 'secondary',
            },
          ]}
        >
          <ScrollView
            nestedScrollEnabled
            style={styles.updateNotes}
            contentContainerStyle={styles.updateNotesContent}
          >
            <MarkdownText markdown={pendingUpdate.releaseNotes} />
          </ScrollView>
        </AppDialog>
      ) : null}
      {isDownloading ? (
        <AppDialog
          visible
          title="正在下载并校验更新"
          icon="cloud-download-outline"
          dismissible={false}
          actions={[
            {
              label: '取消',
              onPress: () => downloadRef.current?.abort(),
              variant: 'secondary',
            },
          ]}
        >
          <View style={styles.progressContent}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${downloadProgress * 100}%`,
                    backgroundColor: primaryColor,
                  },
                ]}
              />
            </View>
            <Text style={styles.percentText}>
              {(downloadProgress * 100).toFixed(1)}%
            </Text>
            <Text type="secondary" style={styles.hint}>
              校验通过后将启动安装
            </Text>
          </View>
        </AppDialog>
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  progressContent: {
    width: '100%',
    alignItems: 'center',
    marginTop: 22,
  },
  updateNotes: { width: '100%', maxHeight: 300, marginTop: 4 },
  updateNotesContent: { paddingBottom: 2 },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(128,128,128,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  percentText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
  },
  hint: {
    fontSize: 13,
  },
});
