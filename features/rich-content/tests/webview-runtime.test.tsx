import vm from 'node:vm';
import { act, render } from '@testing-library/react-native';
import { isTag } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import type { WebViewProps } from 'react-native-webview';
import ZhihuDOMContent, {
  type ZhihuDOMContentProps,
} from '../components/ZhihuDOMContent';

let mockWebViewProps: WebViewProps;
jest.mock('react-native-webview', () => ({
  WebView: (props: WebViewProps) => {
    mockWebViewProps = props;
    return null;
  },
}));
jest.mock('../../../components/Themed', () => ({
  useRuntimeThemeColors: () => ({
    ...require('../../../constants/designTokens').colors.light,
    text: '#102030',
    link: '#203040',
    onPrimary: '#ffffff',
  }),
}));
jest.mock('../../../store/useSettingsStore', () => ({
  useSettingsStore: () => ({ fontSizeScale: 1, lineHeightScale: 1.5 }),
}));

async function renderPage(overrides: Partial<ZhihuDOMContentProps> = {}) {
  const onLinkPress = jest.fn();
  const onImagePress = jest.fn();
  const props: ZhihuDOMContentProps = {
    htmlContent: '<p data-pid="one">正文</p>',
    linkCardInfoStr: '{"title":"</script><script>throw 1</script>"}',
    colorScheme: 'light',
    onLinkPress,
    onImagePress,
    onSegmentPress: jest.fn(),
    ...overrides,
  };
  const view = await render(<ZhihuDOMContent {...props} />);
  const source = mockWebViewProps.source;
  if (!source || !('html' in source)) throw new Error('Expected inline HTML');
  return { html: source.html, onLinkPress, onImagePress, view, props };
}

function inlineScript(html: string): string {
  const scripts = parseDocument(html)
    .children.flatMap((node) => (isTag(node) ? node.children : []))
    .flatMap((node) => (isTag(node) ? node.children : []))
    .filter((node) => isTag(node) && node.name === 'script');
  const script = scripts.at(-1);
  if (!script || !isTag(script)) throw new Error('Expected inline script');
  return script.children
    .map((node) => ('data' in node ? node.data : ''))
    .join('');
}

function bridgeMessage(html: string, message: Record<string, unknown>) {
  const identity = /const documentIdentity = (\d+);/.exec(inlineScript(html));
  if (!identity) throw new Error('Expected document identity');
  return JSON.stringify({ documentIdentity: Number(identity[1]), ...message });
}

test.each([
  undefined,
  () => {
    throw new Error('Invalid formula');
  },
])('initializes height reporting and interaction handlers when KaTeX is unavailable or fails', async (renderMathInElement) => {
  const { html } = await renderPage();
  const postMessage = jest.fn();
  const timers: (() => void)[] = [];
  let resolveFonts: () => void = () => {};
  const fontsReady = new Promise<void>((resolve) => {
    resolveFonts = resolve;
  });
  const container = {
    innerHTML: '',
    children: [],
    scrollHeight: 240,
    getBoundingClientRect: () => ({ height: container.scrollHeight }),
    querySelectorAll: () => [],
    addEventListener: jest.fn(),
  };
  const document = {
    fonts: { ready: fontsReady },
    getElementById: () => container,
    addEventListener: jest.fn(),
    body: { scrollHeight: 800, offsetHeight: 800 },
    documentElement: { scrollHeight: 800, offsetHeight: 800 },
  };
  const window = {
    ReactNativeWebView: { postMessage },
    addEventListener: jest.fn(),
    onload: undefined as (() => void) | undefined,
  };
  vm.runInNewContext(inlineScript(html), {
    document,
    window,
    renderMathInElement,
    setTimeout: (callback: () => void) => timers.push(callback),
  });
  expect(container.innerHTML).toContain('正文');
  expect(container.addEventListener).toHaveBeenCalledWith(
    'click',
    expect.any(Function),
  );
  for (const timer of timers) timer();
  expect(postMessage).toHaveBeenCalledWith(
    bridgeMessage(html, { type: 'height', height: 240 }),
  );
  expect(postMessage).toHaveBeenCalledTimes(1);
  container.scrollHeight = 300;
  resolveFonts();
  await fontsReady;
  expect(postMessage).toHaveBeenLastCalledWith(
    bridgeMessage(html, { type: 'height', height: 300 }),
  );
  container.scrollHeight = 120;
  window.onload?.();
  expect(postMessage).toHaveBeenLastCalledWith(
    bridgeMessage(html, { type: 'height', height: 120 }),
  );
});

test('keeps the document stable on height updates and rejects messages from replaced content', async () => {
  const onReady = jest.fn();
  const { html, view, props, onLinkPress, onImagePress } = await renderPage({
    onReady,
  });
  const firstSource = mockWebViewProps.source;
  const oldCallback = mockWebViewProps.onMessage;
  type MessageEvent = Parameters<NonNullable<WebViewProps['onMessage']>>[0];
  const event = (data: string) => ({ nativeEvent: { data } }) as MessageEvent;
  await act(() => {
    mockWebViewProps.onMessage?.(
      event(bridgeMessage(html, { type: 'height', height: 240 })),
    );
  });
  expect(mockWebViewProps.source).toBe(firstSource);
  expect(onReady).toHaveBeenCalledTimes(1);

  await view.rerender(<ZhihuDOMContent {...props} htmlContent="新正文" />);
  const replacement = mockWebViewProps.source;
  if (!replacement || !('html' in replacement))
    throw new Error('Expected replacement document');
  await act(() => {
    for (const message of [
      { type: 'height', height: 600 },
      { type: 'link', href: 'https://example.com/stale' },
      { type: 'image', src: 'https://example.com/stale.png' },
    ]) {
      const staleEvent = event(bridgeMessage(html, message));
      oldCallback?.(staleEvent);
      mockWebViewProps.onMessage?.(staleEvent);
    }
  });
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(onLinkPress).not.toHaveBeenCalled();
  expect(onImagePress).not.toHaveBeenCalled();
  await act(() => {
    mockWebViewProps.onMessage?.(
      event(bridgeMessage(replacement.html, { type: 'height', height: 120 })),
    );
  });
  expect(onReady).toHaveBeenCalledTimes(2);
  expect(mockWebViewProps.source).toBe(replacement);
});

test('preserves mixed pin content safely in a single document with outer scrolling', async () => {
  const { html } = await renderPage({
    contentArray: [
      { type: 'text', own_text: '<p>第一段</p><script>throw 1</script>' },
      {
        type: 'image',
        url: 'https://example.com/image.png',
        width: 640,
        height: 480,
      },
      {
        type: 'link_card',
        url: 'https://example.com/card',
        data_draft_title: '卡片<img src=x onerror="throw 1">',
        data_draft_cover: 'javascript:throw 1',
      },
    ],
  });
  const container = {
    innerHTML: '',
    querySelectorAll: () => [],
    addEventListener: jest.fn(),
  };
  vm.runInNewContext(inlineScript(html), {
    document: {
      getElementById: () => container,
      addEventListener: jest.fn(),
    },
    window: { addEventListener: jest.fn() },
    setTimeout: jest.fn(),
  });
  const content = parseDocument(container.innerHTML);
  const elements = content.children.filter(isTag);
  expect(elements.map((element) => element.name)).toEqual(['div', 'img', 'a']);
  expect(elements[1].attribs).toMatchObject({
    src: 'https://example.com/image.png',
    'data-rawwidth': '640',
    'data-rawheight': '480',
  });
  expect(elements[2].attribs['data-draft-cover']).toBeUndefined();
  expect(elements[2].children).toHaveLength(1);
  expect(container.innerHTML).not.toContain('<script');
  expect(mockWebViewProps.scrollEnabled).toBe(false);
  expect(mockWebViewProps.showsVerticalScrollIndicator).toBe(false);
  expect(mockWebViewProps.showsHorizontalScrollIndicator).toBe(false);
});

test('builds untrusted footnote labels and definitions as text nodes', async () => {
  const { html } = await renderPage();
  interface Element {
    style: Record<string, string>;
    textContent: string;
    innerText: string;
    id: string;
    children: Element[];
    appendChild: (child: Element) => void;
    replaceChildren: (...children: Element[]) => void;
    getAttribute?: (name: string) => string | null;
  }
  const createElement = (): Element => {
    const children: Element[] = [];
    const element = {
      style: {},
      textContent: '',
      innerText: '',
      id: '',
      children,
      appendChild: (child: Element) => children.push(child),
      replaceChildren: (...next: Element[]) =>
        children.splice(0, children.length, ...next),
    };
    Object.defineProperty(element, 'innerHTML', {
      set: () => {
        throw new Error('Footnote metadata must remain text');
      },
    });
    return element;
  };
  const rawText = '<img src=x onerror="throw 1">';
  const rawLabel = '1"><img src=x onerror="throw 1">';
  const footnote = createElement();
  footnote.getAttribute = (name) =>
    name === 'data-text' ? rawText : name === 'data-numero' ? rawLabel : null;
  const createTextNode = jest.fn((text: string) => {
    const node = createElement();
    node.textContent = text;
    return node;
  });
  const container = {
    innerHTML: '',
    querySelectorAll: (selector: string) =>
      selector === 'sup[data-text]' ? [footnote] : [],
    appendChild: jest.fn(),
    addEventListener: jest.fn(),
  };
  vm.runInNewContext(inlineScript(html), {
    document: {
      getElementById: () => container,
      createElement,
      createTextNode,
      addEventListener: jest.fn(),
    },
    window: { addEventListener: jest.fn() },
    setTimeout: jest.fn(),
  });
  expect(createTextNode).toHaveBeenCalledWith(` ${rawText}`);
  expect(footnote.children[0].textContent).toBe(`[${rawLabel}]`);
  expect(container.appendChild).toHaveBeenCalledTimes(1);
});

test('maps element selection boundaries through a DOM range and clears selections outside source paragraphs', async () => {
  const { html } = await renderPage();
  const postMessage = jest.fn();
  const timers: (() => void)[] = [];
  const listeners = new Map<string, () => void>();
  const container = {
    innerHTML: '',
    querySelectorAll: () => [],
    addEventListener: jest.fn(),
  };
  const paragraph = {
    nodeType: 1,
    getAttribute: (name: string) => (name === 'data-pid' ? 'one' : null),
    parentElement: container,
  };
  const textNode = { nodeType: 3, parentElement: paragraph };
  let endContainer: object = textNode;
  const prefixes: { target: object; offset: number }[] = [];
  const document = {
    getElementById: () => container,
    addEventListener: (type: string, callback: () => void) =>
      listeners.set(type, callback),
    createRange: () => ({
      selectNodeContents: jest.fn(),
      setEnd: (target: object, offset: number) =>
        prefixes.push({ target, offset }),
      toString: () => (prefixes.at(-1)?.target === paragraph ? '甲' : '甲乙丙'),
    }),
  };
  vm.runInNewContext(inlineScript(html), {
    document,
    window: {
      ReactNativeWebView: { postMessage },
      addEventListener: jest.fn(),
      getSelection: () => ({
        isCollapsed: false,
        rangeCount: 1,
        toString: () => '乙丙',
        getRangeAt: () => ({
          startContainer: paragraph,
          startOffset: 1,
          endContainer,
          endOffset: 2,
        }),
      }),
    },
    setTimeout: (callback: () => void) => timers.push(callback),
    clearTimeout: jest.fn(),
  });
  listeners.get('selectionchange')?.();
  timers.pop()?.();
  expect(prefixes).toEqual([
    { target: paragraph, offset: 1 },
    { target: textNode, offset: 2 },
  ]);
  expect(JSON.parse(postMessage.mock.calls.at(-1)?.[0] as string)).toEqual({
    documentIdentity: JSON.parse(bridgeMessage(html, {})).documentIdentity,
    type: 'selection',
    info: {
      text: '乙丙',
      startParagraphId: 'one',
      endParagraphId: 'one',
      startOffset: 1,
      endOffset: 3,
    },
  });
  endContainer = container;
  listeners.get('selectionchange')?.();
  timers.pop()?.();
  expect(postMessage).toHaveBeenLastCalledWith(
    bridgeMessage(html, { type: 'selection', info: null }),
  );
});

test('prevents content navigation from replacing the rendering document', async () => {
  const { onLinkPress } = await renderPage();
  const navigate = (url: string) =>
    mockWebViewProps.onShouldStartLoadWithRequest?.({
      url,
      loading: false,
      title: '',
      canGoBack: false,
      canGoForward: false,
      lockIdentifier: 1,
      navigationType: 'click',
      isTopFrame: true,
    });
  expect(navigate('about:blank')).toBe(true);
  expect(navigate('https://example.com/')).toBe(false);
  expect(onLinkPress).toHaveBeenCalledWith('https://example.com/');
  onLinkPress.mockClear();
  expect(navigate('javascript:throw 1')).toBe(false);
  expect(onLinkPress).not.toHaveBeenCalled();
});

test('formula scripts and fonts are inline with no CDN dependency', async () => {
  const { html } = await renderPage();
  expect(html).not.toContain('cdn.jsdelivr.net');
  const parsed = parseDocument(html);
  const head = parsed.children
    .flatMap((node) => (isTag(node) ? node.children : []))
    .flatMap((node) =>
      isTag(node) && node.name === 'head' ? node.children : [],
    );
  const scripts = head.filter((node) => isTag(node) && node.name === 'script');
  expect(scripts).toHaveLength(2);
  for (const script of scripts)
    if (isTag(script)) expect(script.attribs.src).toBeUndefined();
  expect(html).toContain('data:font/woff2;base64,');
  expect(html).toContain('color: #102030');
  expect(html).toContain('color: #203040');
});
