import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import apiClient from '../api/client';
import {
  buildZhihuNextRenderUrl,
  getAnswerPreviewContinuation,
  getNextContentRender,
  getNextRender,
  getStructuredContentContinuation,
  normalizeZhihuAnswerPreviewPage,
} from '../api/zhihu/nextRender';
import { compileZhihuDocument } from '../features/rich-content/compileRichText';
import {
  decodeRichContentDevFixture,
  parseRichContentFixtureManifest,
} from '../features/rich-content/dev/fixtureDecoder';
import nextRenderSegLikeFixture from '../features/rich-content/fixtures/cases/next-render-seg-like-001.json';
import richContentManifest from '../features/rich-content/fixtures/manifest.json';
import {
  mergeStructuredContentPages,
  normalizeZhihuStructuredContent,
  parseStructuredContentPaging,
} from '../features/rich-content/structuredContent';
import { useAnswerPreviewQuery } from '../hooks/useAnswerPreviewQuery';
import { useAuthStore } from '../store/useAuthStore';
import type { ZhihuStructuredContent } from '../types/zhihu';

jest.mock('../api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
jest.mock('../features/rich-content', () =>
  jest.requireActual('../features/rich-content/structuredContent'),
);

let mockSessionVersion = 1;
jest.mock('../store/useAuthStore', () => {
  const { create } = jest.requireActual('zustand');
  return {
    getAuthSessionVersion: () => mockSessionVersion,
    useAuthStore: create(() => ({ cookies: null })),
  };
});

const OUTER_NEXT =
  'https://api.zhihu.com/next-render?id=answer-a&session_id=synthetic-session&question_feed_cursor=opaque%2Bcursor&page_id=172&limit=5';
const INNER_NEXT =
  'https://api.zhihu.com/next-content-render?offset=20&url_token=answer-a&content_type=answer&version_id=10000000000000000001';
const params = {
  id: '10000000000000000001',
  type: 'answer',
  scenes: 'question_feed',
  collection_id: '10000000000000000002',
  collection_type: 'question',
  question_feed_session_id: '',
  question_feed_cursor: '',
  context_expand: 1,
  is_native: 1,
} as const;

function content(
  ids: string[],
  next = '',
  bodyText = '合成正文',
): ZhihuStructuredContent {
  return {
    paging: JSON.stringify({
      is_end: !next,
      is_start: true,
      next,
      previous: '',
      totals: 0,
    }),
    segments: ids.map((id) => ({
      id,
      type: 'paragraph',
      paragraph: { pid: `${id}-pid`, text: bodyText, marks: [] },
    })),
  };
}

function answer(id: string = params.id, body: unknown = content(['p1'])) {
  return {
    id,
    type: 'answer',
    question: { id: params.collection_id, title: '合成问题' },
    author: {
      id: 'synthetic-author',
      fullname: '合成作者',
      url_token: 'synthetic-author-token',
      avatar: { avatar_image: { day: 'https://example.invalid/avatar.png' } },
      description: '合成签名',
    },
    excerpt: '合成摘要',
    reaction: {
      statistics: { up_vote_count: 7, comment_count: 3, favorites: 2 },
      relation: { vote: 'Up', faved: true, is_author: false },
    },
    structured_content: body,
  };
}

function response(data: unknown[], next = '') {
  return {
    data,
    paging: { is_end: !next, is_start: true, next, previous: '', totals: 0 },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionVersion = 1;
  useAuthStore.setState({ cookies: null });
});

test('normalizes metadata and login prompts while retaining text from unknown source blocks', () => {
  const page = normalizeZhihuAnswerPreviewPage(
    response([
      answer(),
      { id: 'login-prompt', type: 'login_prompt', description: '登录后继续' },
      answer('unsupported', {
        ...content([]),
        segments: [
          { id: 'unknown', type: 'unobserved-node', text: '保留正文' },
        ],
      }),
    ]),
  );
  expect(page.data[0]).toMatchObject({
    id: params.id,
    author: {
      name: '合成作者',
      avatar_url: 'https://example.invalid/avatar.png',
    },
    question: { id: params.collection_id, title: '合成问题' },
    voteup_count: 7,
    relationship: { voting: 1, is_favorited: true },
    structuredContent: { segments: [{ id: 'p1' }] },
  });
  expect(page.data[1]).toEqual({
    id: 'login-prompt',
    type: 'login_prompt',
    description: '登录后继续',
  });
  expect(page.data[2]).toMatchObject({
    id: 'unsupported',
    structuredContent: {
      segments: [
        { id: 'unknown', type: 'unsupported', fallbackText: '保留正文' },
      ],
    },
  });
  expect(() =>
    normalizeZhihuAnswerPreviewPage(response([answer('missing', null)])),
  ).toThrow();
});

test('renders all captured answers with seg_like annotations without losing prose, bold marks or paging boundaries', () => {
  const source = nextRenderSegLikeFixture;
  const original = JSON.stringify(source);
  const page = normalizeZhihuAnswerPreviewPage(source);
  const answers = page.data.filter((item) => item.type === 'answer');
  expect(answers).toHaveLength(5);
  expect(
    answers.map((item) => item.structuredContent?.segments.length),
  ).toEqual([2, 11, 8, 10, 8]);
  expect(page.paging.is_end).toBe(false);
  expect(getAnswerPreviewContinuation([page], [])).toEqual({
    next: source.paging.next,
  });
  let retainedBoldMarks = 0;
  let annotationMarks = 0;
  for (const [index, item] of answers.entries()) {
    const body = item.structuredContent;
    if (!body) throw new Error('Expected renderable captured answer');
    const rawSegments = source.data[index].structured_content.segments;
    for (const [segmentIndex, segment] of body.segments.entries()) {
      if (segment.type !== 'paragraph')
        throw new Error('Expected captured paragraph');
      const raw = rawSegments[segmentIndex].paragraph;
      expect(segment.paragraph.text).toBe(raw.text);
      expect(segment.paragraph.marks).toEqual(raw.marks);
      annotationMarks += raw.marks.filter(
        (mark) => mark.type === 'seg_like',
      ).length;
      retainedBoldMarks += segment.paragraph.marks.filter(
        (mark) => mark.type === 'bold',
      ).length;
    }
    const document = normalizeZhihuStructuredContent(body, {
      documentId: `captured-answer:${item.id}`,
    });
    const compilation = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 25.5,
    });
    expect(compilation.diagnostics).toEqual([]);
    expect(
      compilation.parts
        .flatMap((part) => (part.type === 'flow' ? [part.flow.text] : []))
        .join('\n'),
    ).toBe(rawSegments.map((segment) => segment.paragraph.text).join('\n'));
    const paging = parseStructuredContentPaging(body.paging);
    expect(paging.is_end).toBe(true);
    expect(paging.next).not.toBe('');
    expect(getStructuredContentContinuation([body], [])).toEqual({});
  }
  expect(annotationMarks).toBe(4);
  expect(retainedBoldMarks).toBe(6);
  const summary = parseRichContentFixtureManifest(richContentManifest).find(
    (entry) => entry.id === 'next-render-seg-like-001',
  );
  if (!summary) throw new Error('Expected registered next-render fixture');
  const devFixture = decodeRichContentDevFixture(summary, source);
  expect(devFixture.structuredContent).toEqual(answers[0].structuredContent);
  expect(devFixture.content).toBe('');
  expect(devFixture.objectId).toBe(source.data[0].id);
  expect(devFixture.rendererType).toBe('answer');
  expect(JSON.stringify(source)).toBe(original);
  expect(apiClient.get).not.toHaveBeenCalled();
});

test('requests complete server continuation URLs with stable headers and refuses other origins or endpoints', async () => {
  const initial = new URL(buildZhihuNextRenderUrl(params));
  expect(initial.searchParams.get('id')).toBe(params.id);
  expect(initial.searchParams.get('question_feed_session_id')).toBe('');
  expect(initial.searchParams.get('question_feed_cursor')).toBe('');
  const get = jest.mocked(apiClient.get);
  get.mockResolvedValueOnce({ data: response([answer()]) });
  await getNextRender(OUTER_NEXT);
  expect(get).toHaveBeenLastCalledWith(OUTER_NEXT, {
    signal: undefined,
    headers: { 'x-api-version': '3.0.93', 'x-page-id': '172' },
  });
  get.mockResolvedValueOnce({ data: content(['p2']) });
  expect(await getNextContentRender(INNER_NEXT)).toEqual(content(['p2']));
  expect(get).toHaveBeenLastCalledWith(INNER_NEXT, expect.any(Object));
  const requestCount = get.mock.calls.length;
  for (const url of [
    'https://example.invalid/next-content-render',
    'http://api.zhihu.com/next-content-render',
    'https://api.zhihu.com/answers/1',
    'https://user:password@api.zhihu.com/next-content-render',
  ])
    await expect(getNextContentRender(url)).rejects.toThrow('分页地址无效');
  expect(get).toHaveBeenCalledTimes(requestCount);
});

test('keeps the two pagination layers separate and detects loops or unchanged pages while honoring completion first', () => {
  const firstOuter = normalizeZhihuAnswerPreviewPage(
    response([answer('answer-a')], OUTER_NEXT),
  );
  expect(getAnswerPreviewContinuation([firstOuter], [])).toEqual({
    next: OUTER_NEXT,
  });
  expect(
    getAnswerPreviewContinuation([firstOuter], [OUTER_NEXT]),
  ).toMatchObject({ error: expect.stringContaining('重复') });
  const duplicateOuter = normalizeZhihuAnswerPreviewPage(
    response([answer('answer-a')], `${OUTER_NEXT}&page=2`),
  );
  expect(
    getAnswerPreviewContinuation([firstOuter, duplicateOuter], []),
  ).toMatchObject({ error: expect.stringContaining('没有新增') });

  const firstInner = content(['p1'], INNER_NEXT);
  expect(getStructuredContentContinuation([firstInner], [])).toEqual({
    next: INNER_NEXT,
  });
  expect(
    getStructuredContentContinuation([firstInner], [INNER_NEXT]),
  ).toMatchObject({ error: expect.stringContaining('重复') });
  const duplicateInner = content(['p1'], `${INNER_NEXT}&page=2`);
  expect(
    getStructuredContentContinuation([firstInner, duplicateInner], []),
  ).toMatchObject({ error: expect.stringContaining('没有新增或更新') });
  const updatedInner = content(
    ['p1', 'p2'],
    `${INNER_NEXT}&page=2`,
    '更新正文',
  );
  expect(
    getStructuredContentContinuation([firstInner, updatedInner], []),
  ).toEqual({ next: `${INNER_NEXT}&page=2` });
  expect(
    mergeStructuredContentPages([firstInner, updatedInner]).segments.map(
      (segment) => segment.id,
    ),
  ).toEqual(['p1', 'p2']);
  const ended = content(['p1']);
  ended.paging = JSON.stringify({
    is_end: true,
    is_start: false,
    next: 'https://example.invalid/ignored',
    previous: '',
    totals: 0,
  });
  expect(getStructuredContentContinuation([ended], [])).toEqual({});
});

test('the preview hook follows server cursors and creates a fresh cache after an account switch', async () => {
  const get = jest.mocked(apiClient.get);
  get
    .mockResolvedValueOnce({ data: response([answer('answer-a')], OUTER_NEXT) })
    .mockResolvedValueOnce({ data: response([answer('answer-b')]) })
    .mockResolvedValueOnce({ data: response([answer('new-account-answer')]) });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const host = await renderHook(
    () =>
      useAnswerPreviewQuery({ answerId: 'answer-a', questionId: 'question-a' }),
    { wrapper },
  );
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  expect(get.mock.calls[1][0]).toBe(OUTER_NEXT);
  expect(host.result.current.items.map((item) => item.id)).toEqual([
    'answer-a',
    'answer-b',
  ]);
  await act(async () => {
    mockSessionVersion = 2;
    useAuthStore.setState({ cookies: 'synthetic-new-session' });
  });
  await waitFor(() => {
    expect(host.result.current.items.map((item) => item.id)).toEqual([
      'new-account-answer',
    ]);
  });
  expect(host.result.current.queryKey[2]).toBe(2);
  await host.unmount();
  client.clear();
});

test('a response arriving after the login session changes is rejected before normalization', async () => {
  let finish: (value: { data: unknown }) => void = () => undefined;
  jest.mocked(apiClient.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const request = getNextRender(params, { sessionVersion: 1 });
  mockSessionVersion = 2;
  finish({ data: response([answer()]) });
  await expect(request).rejects.toThrow('登录状态已变化');
});
