import type { FeedItem } from '../api/zhihu';
import {
  applyFeedFilter,
  computeFilterStats,
  evaluateFeedItem,
  type FeedFilterRules,
  isCollapsedGroup,
  supportsLocalFeedFilter,
} from '../utils/feedFilter';
import {
  matchesFeedRegex,
  normalizeFeedRegexPatterns,
  parseFeedRegexInput,
} from '../utils/feedRegex';

const SHORT_BODY_PATTERN = '^.{0,50}$';

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'synthetic-answer',
    isIdStable: true,
    type: 'answers',
    title: '合成问题标题',
    excerpt: '合成摘要',
    content: '<p>合成正文</p>',
    author: { id: 'synthetic-author', name: '合成作者', avatar: '' },
    image: null,
    voteCount: 100,
    commentCount: 0,
    voted: 0,
    ...overrides,
  };
}

function rules(overrides: Partial<FeedFilterRules> = {}): FeedFilterRules {
  return {
    blockPaid: false,
    blockAdPlatform: false,
    blockZhihuSchool: false,
    blockWeChat: false,
    blockLabeled: false,
    blockOrgAuthor: false,
    blockAdvertiser: false,
    regexPatterns: [],
    enableQuality: false,
    qualityLevel: 'standard',
    keepFollowing: true,
    keepUpvotedByFollowee: true,
    ...overrides,
  };
}

describe('custom feed regex input', () => {
  test('normalizes persisted patterns without retaining malformed values', () => {
    const saved = [
      `  ${SHORT_BODY_PATTERN}  `,
      '',
      '[',
      null,
      42,
      SHORT_BODY_PATTERN,
      '推广',
    ];
    expect(normalizeFeedRegexPatterns(saved)).toEqual([
      SHORT_BODY_PATTERN,
      '推广',
    ]);
    expect(saved[0]).toBe(`  ${SHORT_BODY_PATTERN}  `);
    expect(normalizeFeedRegexPatterns(undefined)).toEqual([]);
    expect(normalizeFeedRegexPatterns(SHORT_BODY_PATTERN)).toEqual([]);
    expect(normalizeFeedRegexPatterns({ pattern: SHORT_BODY_PATTERN })).toEqual(
      [],
    );
  });

  test('reports invalid input lines while preserving the other rules', () => {
    expect(
      parseFeedRegexInput(` ${SHORT_BODY_PATTERN} \r\n[\r\n\r\n推广\r\n(`),
    ).toEqual({
      patterns: [SHORT_BODY_PATTERN, '推广'],
      invalidLines: [2, 5],
    });
    expect(parseFeedRegexInput('  \n\r\n')).toEqual({
      patterns: [],
      invalidLines: [],
    });
  });
});

describe('feed regex matching', () => {
  test.each([
    [50, true],
    [51, false],
  ])('matches the requested short-answer boundary at %i characters', (length, matches) => {
    expect(
      matchesFeedRegex(item({ content: `<p>${'字'.repeat(length)}</p>` }), [
        SHORT_BODY_PATTERN,
      ]),
    ).toBe(matches);
  });

  test('matches the complete body without adding the title or short excerpt', () => {
    expect(
      matchesFeedRegex(
        item({
          title: '标题'.repeat(100),
          excerpt: '摘要'.repeat(100),
          content: '<p>短回答</p>',
        }),
        [SHORT_BODY_PATTERN],
      ),
    ).toBe(true);
    expect(
      matchesFeedRegex(
        item({ excerpt: '短摘要', content: `<p>${'长'.repeat(100)}</p>` }),
        [SHORT_BODY_PATTERN],
      ),
    ).toBe(false);
  });

  test('preserves paragraph and br line breaks and matches across them', () => {
    expect(
      matchesFeedRegex(
        item({ content: '<p>第一段<br>第二段</p><p>第三段</p>' }),
        ['^第一段\\n第二段\\n第三段$'],
      ),
    ).toBe(true);
    expect(
      matchesFeedRegex(
        item({ content: `<p>${'字'.repeat(25)}</p><p>${'字'.repeat(25)}</p>` }),
        [SHORT_BODY_PATTERN],
      ),
    ).toBe(false);
    expect(
      matchesFeedRegex(item({ content: '<p>两行<br>回答</p>' }), [
        SHORT_BODY_PATTERN,
      ]),
    ).toBe(true);
  });

  test('counts Unicode code points rather than UTF-16 code units', () => {
    expect(
      matchesFeedRegex(item({ content: '😀'.repeat(50) }), [
        SHORT_BODY_PATTERN,
      ]),
    ).toBe(true);
    expect(
      matchesFeedRegex(item({ content: '😀'.repeat(51) }), [
        SHORT_BODY_PATTERN,
      ]),
    ).toBe(false);
  });

  test('matches visible text with HTML entities decoded and whitespace normalized', () => {
    expect(
      matchesFeedRegex(
        item({
          content:
            '<p data-label="推广">&lt;例&gt;&amp;&nbsp;&#x4E2D;&#25991;</p>',
        }),
        ['^<例>& 中文$'],
      ),
    ).toBe(true);
    expect(
      matchesFeedRegex(item({ content: '<p>第一行\r\n第二行</p>' }), [
        '^第一行\\n第二行$',
      ]),
    ).toBe(true);
  });

  test('does not match attributes, scripts, styles, noscript fallbacks or card titles', () => {
    expect(
      matchesFeedRegex(
        item({
          title: '推广',
          excerpt: '推广',
          content:
            '<script>推广</script><style>推广</style><noscript>推广</noscript><p class="推广"><a href="https://example.test/推广">保留正文</a></p>',
        }),
        ['推广'],
      ),
    ).toBe(false);
  });

  test.each<Partial<FeedItem>>([
    { content: undefined },
    { content: '' },
    { content: ' \n\t ' },
    { content: '<p>&nbsp;</p>' },
    { content: '<script>短正文</script><style>短正文</style>' },
    { content: '<img alt="短正文" src="https://example.test/image.png">' },
    { content: '<p>短正文</p>', contentNeedTruncated: true },
    { type: 'articles', content: '<p>短正文</p>', contentNeedTruncated: true },
  ])('retains missing, truncated and empty bodies: %j', (overrides) => {
    expect(
      matchesFeedRegex(item({ excerpt: '短摘要', ...overrides }), [
        SHORT_BODY_PATTERN,
      ]),
    ).toBe(false);
  });

  test('combines every pin text segment including own_text without matching media metadata', () => {
    const pin = item({
      type: 'pins',
      content: [
        { type: 'text', content: '<p>第一段</p>' },
        { type: 'image', url: 'https://example.test/推广.png' },
        { type: 'text', own_text: '第二段' },
        { type: 'link_card', title: '推广', url: 'https://example.test/' },
      ],
    });
    expect(matchesFeedRegex(pin, ['^第一段\\s+第二段$'])).toBe(true);
    expect(matchesFeedRegex(pin, ['推广'])).toBe(false);
    expect(
      matchesFeedRegex(
        item({
          type: 'pins',
          content: [
            { type: 'text', content: '字'.repeat(30) },
            { type: 'text', content: '字'.repeat(30) },
          ],
        }),
        [SHORT_BODY_PATTERN],
      ),
    ).toBe(false);
    expect(
      matchesFeedRegex(
        item({ type: 'pins', content: [{ type: 'image', title: '短正文' }] }),
        [SHORT_BODY_PATTERN],
      ),
    ).toBe(false);
  });

  test('ignores malformed regexes and still evaluates later valid rules', () => {
    const answer = item({ content: '<p>短正文</p>' });
    expect(matchesFeedRegex(answer, ['['])).toBe(false);
    expect(matchesFeedRegex(answer, ['[', '没有这个词', '短正文'])).toBe(true);
    expect(matchesFeedRegex(answer, [])).toBe(false);
  });

  test('repeated matching stays stable across feed items and rule changes', () => {
    const short = item({ content: '<p>短正文</p>' });
    const long = item({ content: '字'.repeat(51) });
    for (let pass = 0; pass < 3; pass += 1) {
      expect(matchesFeedRegex(short, [SHORT_BODY_PATTERN])).toBe(true);
      expect(matchesFeedRegex(long, [SHORT_BODY_PATTERN])).toBe(false);
    }
    expect(matchesFeedRegex(short, ['长正文'])).toBe(false);
    expect(matchesFeedRegex(short, ['短正文'])).toBe(true);
  });
});

describe('feed filter rule integration', () => {
  test.each<Partial<FeedItem>>([
    { isFollowingAuthor: true },
    { upvotedByFollowee: true },
  ])('keeps followed content ahead of ad, regex and quality rules: %j', (relationship) => {
    expect(
      evaluateFeedItem(
        item({ answerType: 'PAID', voteCount: 0, ...relationship }),
        rules({
          blockPaid: true,
          regexPatterns: [SHORT_BODY_PATTERN],
          enableQuality: true,
        }),
      ).reason,
    ).toBeNull();
  });

  test('allows an exemption to be turned off and preserves ad priority', () => {
    expect(
      evaluateFeedItem(
        item({ isFollowingAuthor: true }),
        rules({ keepFollowing: false, regexPatterns: [SHORT_BODY_PATTERN] }),
      ),
    ).toEqual({ reason: '命中自定义正则', category: 'regex' });
    expect(
      evaluateFeedItem(
        item({ upvotedByFollowee: true }),
        rules({
          keepUpvotedByFollowee: false,
          regexPatterns: [SHORT_BODY_PATTERN],
        }),
      ),
    ).toEqual({ reason: '命中自定义正则', category: 'regex' });
    expect(
      evaluateFeedItem(
        item({ answerType: 'PAID', voteCount: 0 }),
        rules({
          blockPaid: true,
          regexPatterns: [SHORT_BODY_PATTERN],
          enableQuality: true,
        }),
      ),
    ).toEqual({ reason: '知乎盐选付费内容', category: 'ad' });
    expect(
      evaluateFeedItem(
        item({ content: '<a href="https://xg.zhihu.com/">推广</a>' }),
        rules({ blockAdPlatform: true, regexPatterns: [SHORT_BODY_PATTERN] }),
      ),
    ).toEqual({ reason: '知乎广告平台推广', category: 'ad' });
  });

  test('evaluates custom regexes independently of the quality toggle', () => {
    expect(
      evaluateFeedItem(
        item({ voteCount: 100 }),
        rules({ regexPatterns: [SHORT_BODY_PATTERN], enableQuality: false }),
      ),
    ).toEqual({ reason: '命中自定义正则', category: 'regex' });
    const lowVote = item({ voteCount: 0, content: '字'.repeat(51) });
    expect(
      evaluateFeedItem(
        lowVote,
        rules({ regexPatterns: [SHORT_BODY_PATTERN], enableQuality: true }),
      ),
    ).toEqual({ reason: '赞同数 < 10', category: 'quality' });
    expect(
      evaluateFeedItem(
        lowVote,
        rules({ regexPatterns: [SHORT_BODY_PATTERN], enableQuality: false }),
      ).reason,
    ).toBeNull();
  });

  test('uses the same regex verdict for hide mode, collapse groups and effect stats', () => {
    const first = item({ id: 'short-one' });
    const second = item({ id: 'short-two' });
    const retained = item({ id: 'long', content: '字'.repeat(51) });
    const third = item({ id: 'short-three' });
    const items = [first, second, retained, third];
    const filterRules = rules({ regexPatterns: [SHORT_BODY_PATTERN] });

    expect(applyFeedFilter(items, filterRules, 'hide')).toEqual([retained]);
    const collapsed = applyFeedFilter(items, filterRules, 'collapse');
    expect(collapsed).toHaveLength(3);
    expect(isCollapsedGroup(collapsed[0])).toBe(true);
    expect(collapsed[0]).toMatchObject({
      kind: 'collapsed',
      items: [first, second],
      reasons: ['命中自定义正则'],
    });
    expect(collapsed[1]).toBe(retained);
    expect(collapsed[2]).toMatchObject({
      kind: 'collapsed',
      items: [third],
      reasons: ['命中自定义正则'],
    });
    expect(computeFilterStats(items, filterRules)).toEqual({
      total: 4,
      filtered: 3,
      rate: 0.75,
      reasons: { 命中自定义正则: 3 },
    });
  });

  test('leaves feeds outside recommend out of the local filter pipeline', () => {
    expect(supportsLocalFeedFilter('recommend')).toBe(true);
    for (const tab of ['following', 'hot', 'local', 'unknown']) {
      expect(supportsLocalFeedFilter(tab)).toBe(false);
    }
  });
});
