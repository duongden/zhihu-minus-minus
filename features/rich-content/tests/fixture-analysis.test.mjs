import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  analyzeFixtureCase,
  analyzeFixtureDirectory,
  analyzeHtml,
  loadManifest,
  normalizeFixtureHtml,
  splitFixtureBlocks,
} from '../tools/fixture-lib.mjs';

const manifestPath = fileURLToPath(
  new URL('../fixtures/manifest.json', import.meta.url),
);
const inboxPath = fileURLToPath(new URL('../fixtures/inbox/', import.meta.url));

test('normalizes captured escaped HTML values', () => {
  assert.equal(
    normalizeFixtureHtml('<p data-pid=\\"one\\">x</p>'),
    '<p data-pid="one">x</p>',
  );
  assert.equal(
    normalizeFixtureHtml('"<p>JSON value</p>"'),
    '<p>JSON value</p>',
  );
});

test('splits a legacy multi-sample fixture on blank lines', () => {
  assert.deepEqual(
    splitFixtureBlocks('<p>A</p>\n<span>A2</span>\n\n<p>B</p>'),
    ['<p>A</p>\n<span>A2</span>', '<p>B</p>'],
  );
});

test('normalizes escaped closing tags from captured API values', () => {
  assert.deepEqual(normalizeFixtureHtml('<p>A<\\/p>'), '<p>A</p>');
});

test('discovers every unregistered inbox sample without manifest work', async () => {
  const results = await analyzeFixtureDirectory(inboxPath);
  assert.ok(results.some(({ id }) => id === 'inbox:pig.md#0'));
  assert.ok(results.every(({ stats }) => stats.characters > 0));
});

test('keeps a single-line legacy split compatible', () => {
  assert.deepEqual(splitFixtureBlocks('<p>A</p>\n\n\n<p>B</p>'), [
    '<p>A</p>',
    '<p>B</p>',
  ]);
});

test('excludes noscript fallback images from active image counts', () => {
  const stats = analyzeHtml(
    '<figure><noscript><img src="fallback.jpg"></noscript><img src="active.jpg"></figure>',
  );
  assert.equal(stats.totalImages, 2);
  assert.equal(stats.activeImages, 1);
  assert.equal(stats.noscripts, 1);
});

test('all registered real-world fixtures retain their expected structure', async (t) => {
  const manifest = await loadManifest(manifestPath);
  for (const fixtureCase of manifest.cases) {
    await t.test(fixtureCase.id, async () => {
      const result = await analyzeFixtureCase(fixtureCase, manifestPath);
      assert.deepEqual(result.errors, []);
    });
  }
});
