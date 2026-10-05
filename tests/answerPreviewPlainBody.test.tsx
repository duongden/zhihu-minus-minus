import { render } from '@testing-library/react-native';
import type { ZhihuPlainPreviewAnswer } from '../api/zhihu/nextRender';
import { AnswerPreviewPlainBody } from '../components/AnswerPreviewPlainBody';
import type { ZhihuContentProps } from '../features/rich-content';

let mockBodyProps: ZhihuContentProps;

jest.mock('../features/rich-content', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ZhihuContent: (props: ZhihuContentProps) => {
      mockBodyProps = props;
      return react.createElement(native.View, { testID: 'ordinary-body-host' });
    },
  };
});
jest.mock('../components/Themed', () => ({
  Text: jest.requireActual<typeof import('react-native')>('react-native').Text,
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

test('keeps the selected HTML fully expanded with its original metadata and interaction', async () => {
  const html = answer(
    '<p data-pid="synthetic-duplicate-pid">合成&lt;&amp;第一段<strong>加粗</strong></p>' +
      '<a class="LinkCard" href="https://example.invalid/card">卡片</a>' +
      '<p>第三段</p><p data-pid="synthetic-duplicate-pid">完整末段<a class="footnote-ref" data-numero="1">[1]</a></p>' +
      '<section class="footnotes"><ol><li data-numero="1"><p>完整脚注全文</p></li></ol></section>',
  );
  const original = JSON.stringify(html);
  const onRefresh = jest.fn();
  const host = await render(
    <AnswerPreviewPlainBody
      item={html}
      scope="synthetic-session:42"
      onRefresh={onRefresh}
    />,
  );
  expect(mockBodyProps).toMatchObject({
    objectId: html.id,
    type: 'answer',
    selectable: true,
  });
  expect(mockBodyProps.content).toBe(html.content);
  expect(mockBodyProps.document).toBeUndefined();
  expect(mockBodyProps.renderer).toBeUndefined();
  expect(mockBodyProps.segmentInfos).toBe(html.segmentInfos);
  expect(mockBodyProps.linkCardInfo).toBe(html.linkCardInfo);
  mockBodyProps.onRefresh?.();
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(host.queryByText('收起回答')).toBeNull();
  expect(host.queryByText('展开回答')).toBeNull();
  expect(JSON.stringify(html)).toBe(original);
  await host.unmount();
});

test('keeps all array segments available and preserves incomplete-body notices without collapse', async () => {
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
  const props = {
    item: array,
    scope: 'synthetic-session:42',
    onRefresh: jest.fn(),
  };
  const host = await render(<AnswerPreviewPlainBody {...props} />);
  expect(mockBodyProps.contentArray).toBe(array.content);
  expect(mockBodyProps.content).toBeUndefined();
  expect(mockBodyProps.segmentInfos).toBe(array.segmentInfos);
  expect(mockBodyProps.linkCardInfo).toBe(array.linkCardInfo);
  expect(mockBodyProps.selectable).toBe(true);
  expect(host.queryByText('收起回答')).toBeNull();
  const partial = {
    ...answer('<p>短正文</p>'),
    contentNeedTruncated: true,
    answerType: 'PAID',
  };
  await host.rerender(<AnswerPreviewPlainBody {...props} item={partial} />);
  expect(host.getByText('当前仅展示部分正文')).toBeTruthy();
  expect(mockBodyProps.content).toBe(partial.content);
  expect(host.queryByText('展开回答')).toBeNull();
  expect(host.queryByText('收起回答')).toBeNull();
  await host.unmount();
});
