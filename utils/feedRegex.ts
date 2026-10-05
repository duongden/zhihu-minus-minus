import { Parser } from 'htmlparser2';
import type { FeedItem } from '@/api/zhihu/feed';

// Dot matches paragraph breaks; Unicode characters (including emoji) count once.
// No g/y flags: repeated evaluations must not depend on RegExp.lastIndex.
const REGEX_FLAGS = 'su';

function compilePattern(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, REGEX_FLAGS);
  } catch {
    return null;
  }
}

/** Accept only unique, nonempty, valid regex sources from persisted settings. */
export function normalizeFeedRegexPatterns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const patterns = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const pattern = entry.trim();
    if (pattern && compilePattern(pattern)) patterns.add(pattern);
  }
  return Array.from(patterns);
}

/** Blank lines are ignored; error positions refer to the original editor lines. */
export function parseFeedRegexInput(input: string): {
  patterns: string[];
  invalidLines: number[];
} {
  const patterns = new Set<string>();
  const invalidLines: number[] = [];
  input.split(/\r?\n/).forEach((line, index) => {
    const pattern = line.trim();
    if (!pattern) return;
    if (compilePattern(pattern)) patterns.add(pattern);
    else invalidLines.push(index + 1);
  });
  return { patterns: Array.from(patterns), invalidLines };
}

const BLOCK_TAGS = new Set([
  'p',
  'div',
  'blockquote',
  'li',
  'ul',
  'ol',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'pre',
  'tr',
]);
const IGNORED_TAGS = new Set(['script', 'style', 'noscript']);

/** Read visible text without markup or attribute values, decoding HTML entities. */
function htmlToFilterText(html: string): string {
  const parts: string[] = [];
  let hiddenDepth = 0;
  const hiddenStack: boolean[] = [];
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        const hidden =
          IGNORED_TAGS.has(name) ||
          'hidden' in attributes ||
          attributes['aria-hidden'] === 'true';
        hiddenStack.push(hidden);
        if (hidden) hiddenDepth += 1;
        if (hiddenDepth === 0 && (name === 'br' || BLOCK_TAGS.has(name))) {
          parts.push('\n');
        }
      },
      ontext(text) {
        if (hiddenDepth === 0) parts.push(text);
      },
      onclosetag(name) {
        if (hiddenStack.pop()) hiddenDepth -= 1;
        if (hiddenDepth === 0 && BLOCK_TAGS.has(name)) parts.push('\n');
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  return parts
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n+/g, '\n')
    .trim();
}

const compiledPatterns = new WeakMap<readonly string[], RegExp[]>();
const bodyTexts = new WeakMap<FeedItem, string>();

function getBodyText(item: FeedItem): string {
  const cached = bodyTexts.get(item);
  if (cached !== undefined) return cached;
  const content = item.content;
  const html =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .filter((segment) => segment.type === 'text')
            .map((segment) => segment.content || segment.own_text || '')
            .join('\n')
        : '';
  const text = htmlToFilterText(html);
  bodyTexts.set(item, text);
  return text;
}

/** Match full recommendation bodies only; excerpts must not look like short answers. */
export function matchesFeedRegex(
  item: FeedItem,
  patterns: readonly string[],
): boolean {
  if (
    !Array.isArray(patterns) ||
    patterns.length === 0 ||
    item.contentNeedTruncated === true
  ) {
    return false;
  }
  let expressions = compiledPatterns.get(patterns);
  if (!expressions) {
    expressions = normalizeFeedRegexPatterns(patterns).flatMap((pattern) => {
      const expression = compilePattern(pattern);
      return expression ? [expression] : [];
    });
    compiledPatterns.set(patterns, expressions);
  }
  if (expressions.length === 0) return false;
  const text = getBodyText(item);
  return (
    text.length > 0 && expressions.some((expression) => expression.test(text))
  );
}
