import assert from 'node:assert/strict';
import test from 'node:test';
import { isVersionNewer, selectAndroidApk } from '../utils/updateSelection.ts';

const assets = [
  {
    name: 'SHA256SUMS.txt',
    browser_download_url: 'https://example.com/checksums',
  },
  {
    name: 'zhihu-minus-minus-v0.6.2-preview-arm64-v8a.apk',
    browser_download_url: 'https://example.com/arm64',
  },
  {
    name: 'zhihu-minus-minus-v0.6.2-preview-compat-armeabi-v7a.apk',
    browser_download_url: 'https://example.com/armv7',
  },
  {
    name: 'zhihu-minus-minus-v0.6.2-preview-compat-x86.apk',
    browser_download_url: 'https://example.com/x86',
  },
  {
    name: 'zhihu-minus-minus-v0.6.2-preview-compat-x86_64.apk',
    browser_download_url: 'https://example.com/x86_64',
  },
];

test('selects the first supported ABI rather than the first APK asset', () => {
  assert.equal(
    selectAndroidApk(assets, ['x86_64', 'x86'])?.browser_download_url,
    'https://example.com/x86_64',
  );
  assert.equal(
    selectAndroidApk(assets, ['armeabi-v7a'])?.browser_download_url,
    'https://example.com/armv7',
  );
});

test('keeps the verified arm64 asset compatible with its historical name', () => {
  assert.equal(
    selectAndroidApk(assets, ['arm64-v8a', 'armeabi-v7a'])
      ?.browser_download_url,
    'https://example.com/arm64',
  );
});

test('does not guess when the device ABI or asset name is unknown', () => {
  assert.equal(selectAndroidApk(assets, null), undefined);
  assert.equal(
    selectAndroidApk(
      [
        {
          name: 'some-random-build.apk',
          browser_download_url: 'https://example.com/random',
        },
      ],
      ['arm64-v8a'],
    ),
    undefined,
  );
});

test('uses a universal APK only as a safe fallback', () => {
  const universal = {
    name: 'zhihu-minus-minus-v0.6.2-preview-universal.apk',
    browser_download_url: 'https://example.com/universal',
  };

  assert.equal(
    selectAndroidApk([...assets, universal], ['riscv64'])?.browser_download_url,
    'https://example.com/universal',
  );
});

test('compares dotted application versions', () => {
  assert.equal(isVersionNewer('0.6.2', '0.6.1'), true);
  assert.equal(isVersionNewer('0.6.2', '0.6.2'), false);
  assert.equal(isVersionNewer('0.6.1', '0.6.2'), false);
});
