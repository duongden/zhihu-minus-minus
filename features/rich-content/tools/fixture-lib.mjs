import { readFile } from 'node:fs/promises';
import path from 'node:path';

const OPEN_TAG_PATTERN = /<([a-z][a-z0-9-]*)(?:\s|\/?>)/gi;

function countMatches(value, pattern) {
  return Array.from(value.matchAll(pattern)).length;
}

function getOpeningTags(html) {
  const tags = {};
  for (const match of html.matchAll(OPEN_TAG_PATTERN)) {
    const tag = match[1].toLowerCase();
    tags[tag] = (tags[tag] ?? 0) + 1;
  }
  return tags;
}

export function splitFixtureBlocks(raw) {
  return raw
    .split(/\r?\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function normalizeFixtureHtml(rawBlock) {
  const trimmed = rawBlock.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // Some captured API values only escape attribute quotes and are not a
      // complete JSON string. Fall through to the conservative normalization.
    }
  }
  return trimmed.replaceAll('\\"', '"');
}

export function analyzeHtml(html) {
  const tags = getOpeningTags(html);
  const activeHtml = html.replace(
    /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,
    '',
  );
  const activeTags = getOpeningTags(activeHtml);
  const formulaImages = Array.from(
    activeHtml.matchAll(/<img\b[^>]*>/gi),
  ).filter(
    ([tag]) =>
      /\beeimg=(?:"|')?[12](?:"|')?/i.test(tag) ||
      /zhihu\.com\/equation\?/i.test(tag),
  ).length;

  return {
    characters: html.length,
    bytes: Buffer.byteLength(html),
    paragraphs: activeTags.p ?? 0,
    headings: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].reduce(
      (total, tag) => total + (activeTags[tag] ?? 0),
      0,
    ),
    figures: activeTags.figure ?? 0,
    figcaptions: activeTags.figcaption ?? 0,
    lists: (activeTags.ul ?? 0) + (activeTags.ol ?? 0),
    totalImages: tags.img ?? 0,
    activeImages: activeTags.img ?? 0,
    formulaImages,
    noscripts: tags.noscript ?? 0,
    videoBoxes: countMatches(
      activeHtml,
      /<a\b[^>]*class=(?:"|')[^"']*\bvideo-box\b[^"']*(?:"|')[^>]*>/gi,
    ),
    linkCards: countMatches(
      activeHtml,
      /<a\b[^>]*(?:data-draft-type=(?:"|')link-card(?:"|')|class=(?:"|')[^"']*\bLinkCard\b[^"']*(?:"|'))[^>]*>/gi,
    ),
  };
}

export function compareExpected(actual, expected = {}) {
  return Object.entries(expected).flatMap(([key, expectedValue]) => {
    const actualValue = actual[key];
    return actualValue === expectedValue
      ? []
      : [`${key}: expected ${expectedValue}, received ${actualValue}`];
  });
}

export async function loadManifest(manifestPath) {
  const raw = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);
  if (manifest.version !== 1 || !Array.isArray(manifest.cases)) {
    throw new Error(`Unsupported fixture manifest: ${manifestPath}`);
  }
  return manifest;
}

export async function analyzeFixtureCase(fixtureCase, manifestPath) {
  const filePath = path.resolve(path.dirname(manifestPath), fixtureCase.file);
  const raw = await readFile(filePath, 'utf8');
  const blocks = splitFixtureBlocks(raw);
  const block = blocks[fixtureCase.block ?? 0];
  if (block === undefined) {
    throw new Error(
      `${fixtureCase.id}: block ${fixtureCase.block ?? 0} not found in ${filePath}`,
    );
  }

  const html = normalizeFixtureHtml(block);
  const stats = analyzeHtml(html);
  return {
    ...fixtureCase,
    filePath,
    stats,
    errors: compareExpected(stats, fixtureCase.expected),
  };
}
