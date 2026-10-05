import { fireEvent, render } from '@testing-library/react-native';
import type { ZhihuPlainPreviewAnswer } from '../api/zhihu/nextRender';
import { AnswerPreviewPlainBody } from '../components/AnswerPreviewPlainBody';
import type { ZhihuContentProps } from '../features/rich-content';
import { walkZhihuDocument } from '../features/rich-content/documentTraversal';

let mockBodyProps: ZhihuContentProps;

jest.mock('../features/rich-content', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  const normalization = jest.requireActual<
    typeof import('../features/rich-content/normalization/normalizeZhihuDocument')
  >('../features/rich-content/normalization/normalizeZhihuDocument');
  return {
    normalizeZhihuDocument: normalization.normalizeZhihuDocument,
    ZhihuContent: (props: ZhihuContentProps) => {
      mockBodyProps = props;
      return react.createElement(native.View, { testID: 'ordinary-body-host' });
    },
  };
});
jest.mock('../components/ContentActionButton', () => ({
  ContentActionButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('../components/Themed', () => ({
  Text: jest.requireActual<typeof import('react-native')>('react-native').Text,
  useRuntimeThemeColors: () => ({ link: '#123456' }),
}));

function answer(
  content: ZhihuPlainPreviewAnswer['content'],
): ZhihuPlainPreviewAnswer {
  return {
    id: '42',
    type: 'answer',
    question: { id: 'synthetic-question', title: '合成问题' },
    author: {
      id: 'synthetic-author',
      name: '合成作者',
      url_token: 'synthetic-author-token',
      avatar_url: '',
      headline: '',
    },
    excerpt: '',
    voteup_count: 0,
    comment_count: 0,
    favlists_count: 0,
    relationship: { is_author: false, is_favorited: false, voting: 0 },
    content,
    segmentInfos: [
      {
        pid: 'synthetic-duplicate-pid',
        text: '合成<&第一段加粗',
        marks: [
          {
            start_index: 0,
            end_index: 2,
            seg_info: {
              seg_ids: ['201'],
              is_like: false,
              like_count: 0,
              comment_count: 0,
            },
          },
        ],
      },
    ],
    linkCardInfo: {
      'https://example.invalid/card': {
        display: { title: '合成卡片标题', desc: '合成卡片说明' },
      },
    },
  };
}

test('previews HTML and arrays without business interaction, then restores raw bodies and complete metadata', async () => {
  const html = answer(
    '<p data-pid="synthetic-duplicate-pid">合成&lt;&amp;第一段<strong>加粗</strong></p>' +
      '<a class="LinkCard" href="https://example.invalid/card">卡片</a>' +
      '<p>第三段</p><p data-pid="synthetic-duplicate-pid">隐藏的重复段落<a class="footnote-ref" data-numero="1">[1]</a></p>' +
      '<section class="footnotes"><ol><li data-numero="1"><p>隐藏的脚注全文</p></li></ol></section>',
  );
  const original = JSON.stringify(html);
  const onExpandedChange = jest.fn();
  const onRefresh = jest.fn();
  const props = {
    item: html,
    scope: 'synthetic-session:42',
    expanded: false,
    onExpandedChange,
    onRefresh,
  };
  const host = await render(<AnswerPreviewPlainBody {...props} />);
  expect(
    host.getByTestId('answer-preview-plain-body').props.pointerEvents,
  ).toBe('none');
  expect(mockBodyProps).toMatchObject({
    objectId: html.id,
    type: 'answer',
    selectable: false,
  });
  expect(mockBodyProps.segmentInfos).toBeUndefined();
  expect(mockBodyProps.content).toBeUndefined();
  expect(mockBodyProps.onRefresh).toBeUndefined();
  expect(mockBodyProps.renderer).toBeUndefined();
  const preview = mockBodyProps.document;
  if (!preview) throw new Error('Expected normalized preview');
  expect(preview.id).toBe('answer:42');
  expect(preview.blocks).toHaveLength(3);
  expect(preview.footnotes).toEqual([]);
  expect(preview.blocks[1]).toMatchObject({
    type: 'linkCard',
    title: '合成卡片标题',
    description: '合成卡片说明',
  });
  const nodes = [...walkZhihuDocument(preview)];
  expect(
    nodes
      .filter((node) => node.type === 'text')
      .map((node) => node.text)
      .join(''),
  ).toBe('合成<&第一段加粗第三段');
  expect(nodes.some((node) => node.type === 'segment')).toBe(false);

  await fireEvent.press(host.getByText('展开回答'));
  expect(onExpandedChange).toHaveBeenLastCalledWith(true);
  await host.rerender(<AnswerPreviewPlainBody {...props} expanded />);
  expect(
    host.getByTestId('answer-preview-plain-body').props.pointerEvents,
  ).toBe('auto');
  expect(mockBodyProps.content).toBe(html.content);
  expect(mockBodyProps.document).toBeUndefined();
  expect(mockBodyProps.segmentInfos).toBe(html.segmentInfos);
  expect(mockBodyProps.linkCardInfo).toBe(html.linkCardInfo);
  expect(mockBodyProps.selectable).toBe(true);
  mockBodyProps.onRefresh?.();
  expect(onRefresh).toHaveBeenCalledTimes(1);
  await fireEvent.press(host.getByText('收起回答'));
  expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  expect(JSON.stringify(html)).toBe(original);

  const array = answer([
    { type: 'text', content: '<p>数组原文&lt;&amp;</p>' },
    { type: 'image', url: 'https://example.invalid/image.png' },
    {
      type: 'link_card',
      url: 'https://example.invalid/card',
      title: '数组卡片',
    },
    { type: 'text', content: '<p>数组末段</p>' },
  ]);
  await host.rerender(<AnswerPreviewPlainBody {...props} item={array} />);
  expect(mockBodyProps.contentArray).toEqual(array.content.slice(0, 3));
  expect(mockBodyProps.segmentInfos).toBeUndefined();
  expect(mockBodyProps.selectable).toBe(false);
  expect(
    host.getByTestId('answer-preview-plain-body').props.pointerEvents,
  ).toBe('none');
  await host.rerender(
    <AnswerPreviewPlainBody {...props} item={array} expanded />,
  );
  expect(mockBodyProps.contentArray).toBe(array.content);
  expect(mockBodyProps.content).toBeUndefined();
  expect(mockBodyProps.segmentInfos).toBe(array.segmentInfos);
  expect(mockBodyProps.linkCardInfo).toBe(array.linkCardInfo);

  const partial = {
    ...answer('<p>短正文</p>'),
    contentNeedTruncated: true,
    answerType: 'PAID',
  };
  await host.rerender(<AnswerPreviewPlainBody {...props} item={partial} />);
  expect(host.getByText('当前仅展示部分正文')).toBeTruthy();
  expect(host.getByText('展开回答')).toBeTruthy();
  await host.unmount();
});
