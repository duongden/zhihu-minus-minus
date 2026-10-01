import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isTag, type Node } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import {
  getSafeRichContentUrl,
  sanitizeRichContentHtml,
  serializeInlineScriptValue,
} from '../webviewSecurity';

function elements(nodes: readonly Node[]) {
  return nodes.flatMap((node): ReturnType<typeof parseDocument>['children'] =>
    isTag(node) ? [node, ...elements(node.children)] : [],
  );
}

test('script serialization preserves content without exposing HTML delimiters', () => {
  const value = '</script><script>throw 1</script><!--&\u2028\u2029';
  const serialized = serializeInlineScriptValue(value);
  expect(serialized).not.toMatch(/[<>&\u2028\u2029]/);
  expect(JSON.parse(serialized)).toBe(value);
});

test('the registered synthetic fixture removes executable nodes, handlers and URLs while retaining content semantics', () => {
  const fixture = JSON.parse(
    readFileSync(
      path.join(
        __dirname,
        '../fixtures/cases/webview-untrusted-content-001.json',
      ),
      'utf8',
    ),
  ) as { content: string };
  const sanitized = sanitizeRichContentHtml(fixture.content);
  const nodes = elements(parseDocument(sanitized).children).filter(isTag);
  expect(nodes.map((node) => node.name)).toEqual([
    'p',
    'strong',
    'img',
    'a',
    'sup',
  ]);
  expect(nodes[0].attribs).toEqual({
    'data-pid': 'synthetic-paragraph',
    style: 'color: red',
  });
  expect(nodes[2].attribs).toEqual({ src: 'https://example.com/image.png' });
  expect(nodes[3].attribs.href).toBeUndefined();
  expect(nodes[4].attribs['data-text']).toBe('<img src=x onerror="throw 1">');
  expect(sanitized).toContain('<strong>保留格式</strong>');
});

test.each([
  'javascript:throw 1',
  'java\nscript:throw 1',
  'data:text/html,<script>throw 1</script>',
  'file:///private/example',
  'https://user:password@example.com/image.png',
  'https://link.zhihu.com/?target=javascript%3Athrow%201',
])('rejects an unsafe content URL %s', (url) => {
  expect(getSafeRichContentUrl(url)).toBeUndefined();
});

test('keeps safe links, resources and inert image data while validating redirect destinations', () => {
  expect(getSafeRichContentUrl('/question/1')).toBe(
    'https://www.zhihu.com/question/1',
  );
  expect(getSafeRichContentUrl('zhihu://answers/1')).toBe('zhihu://answers/1');
  expect(
    getSafeRichContentUrl(
      'https://link.zhihu.com/?target=https%3A%2F%2Fexample.com%2F',
    ),
  ).toBe('https://example.com/');
  expect(getSafeRichContentUrl('//example.com/image.png', true)).toBe(
    'https://example.com/image.png',
  );
  expect(getSafeRichContentUrl('data:image/png;base64,AA==', true)).toBe(
    'data:image/png;base64,AA==',
  );
  expect(getSafeRichContentUrl('data:image/png;base64,AA==')).toBeUndefined();
  expect(getSafeRichContentUrl('zhihu://answers/1', true)).toBeUndefined();
  const originalHref =
    'https://link.zhihu.com/?target=https%3A%2F%2Fexample.com%2F';
  const anchor = parseDocument(
    sanitizeRichContentHtml(`<a href="${originalHref}">卡片</a>`),
  ).children[0];
  expect(isTag(anchor) && anchor.attribs.href).toBe(originalHref);
});

test('unwraps unknown HTML containers and prevents foreign namespace mutation or CSS resource loads', () => {
  const sanitized = sanitizeRichContentHtml(
    '<custom><p style="color:red;background-color:url(https://example.com);font-size:18px" onclick="throw 1">文字</p></custom><svg><foreignObject><p onclick="throw 1">隐藏内容</p></foreignObject></svg><math><mtext><img src=x onerror="throw 1"></mtext></math>',
  );
  expect(sanitized).toBe('<p style="color:red;font-size:18px">文字</p>');
});
