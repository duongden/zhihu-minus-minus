import vm from 'node:vm';
import { render } from '@testing-library/react-native';
import { isTag } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import type { WebViewProps } from 'react-native-webview';
import ZhihuDOMContent from '../components/ZhihuDOMContent';

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

async function renderPage() {
  const onLinkPress = jest.fn();
  const onImagePress = jest.fn();
  await render(
    <ZhihuDOMContent
      htmlContent='<p data-pid="one">正文</p>'
      linkCardInfoStr='{"title":"</script><script>throw 1</script>"}'
      colorScheme="light"
      onLinkPress={onLinkPress}
      onImagePress={onImagePress}
      onSegmentPress={jest.fn()}
    />,
  );
  const source = mockWebViewProps.source;
  if (!source || !('html' in source)) throw new Error('Expected inline HTML');
  return { html: source.html, onLinkPress, onImagePress };
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
    querySelectorAll: () => [],
    addEventListener: jest.fn(),
  };
  const document = {
    fonts: { ready: fontsReady },
    getElementById: () => container,
    addEventListener: jest.fn(),
    body: { scrollHeight: 240, offsetHeight: 240 },
    documentElement: { scrollHeight: 240, offsetHeight: 240 },
  };
  vm.runInNewContext(inlineScript(html), {
    document,
    window: {
      ReactNativeWebView: { postMessage },
      addEventListener: jest.fn(),
    },
    renderMathInElement,
    setTimeout: (callback: () => void) => timers.push(callback),
  });
  expect(container.innerHTML).toContain('正文');
  expect(container.addEventListener).toHaveBeenCalledWith(
    'click',
    expect.any(Function),
  );
  for (const timer of timers) timer();
  expect(postMessage).toHaveBeenCalledWith('{"type":"height","height":240}');
  document.body.scrollHeight = 300;
  resolveFonts();
  await fontsReady;
  expect(postMessage).toHaveBeenLastCalledWith(
    '{"type":"height","height":300}',
  );
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
    '{"type":"selection","info":null}',
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
