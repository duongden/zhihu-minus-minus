import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { type LayoutChangeEvent, Text } from 'react-native';
import type {
  RichTextHeightEventData,
  RichTextNativeViewProps,
} from '../../../modules/zhihu-rich-text';
import { ZhihuNativeContent } from '../components/ZhihuNativeContent';
import type { RichTextFlow } from '../richText';

let mockNativeAvailable = true;
let mockTextColor = '#234567';
const mockNativeViews = new Map<string, RichTextNativeViewProps>();
const mockNativeMounts = new Map<string, number>();
const mockSvgProps: { uri: string; color?: string; fill?: string }[] = [];

jest.mock('../../../modules/zhihu-rich-text', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    isRichTextNativeAvailable: () => mockNativeAvailable,
    RichTextNativeView: (props: RichTextNativeViewProps) => {
      const flow = JSON.parse(props.flowJson) as RichTextFlow;
      mockNativeViews.set(flow.id, props);
      react.useEffect(() => {
        mockNativeMounts.set(flow.id, (mockNativeMounts.get(flow.id) ?? 0) + 1);
      }, [flow.id]);
      return react.createElement(
        native.View,
        { testID: `native-flow-${flow.id}`, style: props.style },
        react.createElement(native.Text, null, flow.text),
      );
    },
  };
});
jest.mock('../../../components/Themed', () => ({
  useThemeColor: () => mockTextColor,
}));
jest.mock('../../../store/useSettingsStore', () => ({
  useSettingsStore: () => ({ fontSizeScale: 1, lineHeightScale: 1.5 }),
}));
jest.mock('react-native-svg', () => ({
  SvgUri: (props: { uri: string; color?: string; fill?: string }) => {
    mockSvgProps.push(props);
    return null;
  },
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

function currentViews(): RichTextNativeViewProps[] {
  return [...mockNativeViews.values()];
}

function flowId(props: RichTextNativeViewProps): string {
  return (JSON.parse(props.flowJson) as RichTextFlow).id;
}

async function heightEvent(
  props: RichTextNativeViewProps,
  changes: Partial<RichTextHeightEventData> = {},
): Promise<void> {
  const flow = JSON.parse(props.flowJson) as RichTextFlow;
  await act(() => {
    props.onHeightChange?.({
      flowId: flow.id,
      textVersion: flow.textVersion,
      layoutKey: props.layoutKey,
      height: 120,
      ...changes,
    });
  });
}

async function containerLayout(width: number): Promise<void> {
  if (!screen.root) throw new Error('Missing renderer root');
  await fireEvent(screen.root, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNativeAvailable = true;
  mockTextColor = '#234567';
  mockNativeViews.clear();
  mockNativeMounts.clear();
  mockSvgProps.length = 0;
});

describe('Native V2 renderer staging transitions', () => {
  it('keeps short inline formulas inside the surrounding list sentence', async () => {
    await render(
      <ZhihuNativeContent
        content='<ul><li data-pid="formula-list">单位矩阵 <img eeimg="1" src="https://www.zhihu.com/equation?tex=I" alt="I"/> 仍在句内。</li><li>普通段落</li></ul>'
        objectId="staging-inline-formula"
        type="answer"
        renderFallback={() => <Text>经典排版回退</Text>}
      />,
    );
    expect(currentViews()).toHaveLength(1);
    const flow = JSON.parse(currentViews()[0].flowJson) as RichTextFlow;
    expect(flow.text).toBe('• 单位矩阵 \uFFFC 仍在句内。\n• 普通段落');
    expect(flow.paragraphs).toHaveLength(2);
    expect(flow.attachments).toHaveLength(1);
    expect(flow.attachments[0].copyText).toBe('I');
  });

  it('passes the current text color to inline and display formula attachments while keeping ordinary SVG images untinted', async () => {
    const inlineUri = 'https://www.zhihu.com/equation?tex=x';
    const displayUri = 'https://www.zhihu.com/equation?tex=y';
    const imageUri = 'https://example.com/original.svg';
    const props = {
      content: `<p>行内<img eeimg="1" src="${inlineUri}" alt="x"/>公式。</p><img eeimg="2" src="${displayUri}" alt="y"/><img src="${imageUri}" width="240" height="120"/>`,
      objectId: 'staging-formula-theme',
      type: 'answer' as const,
      renderFallback: () => <Text>经典排版回退</Text>,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    expect(currentViews()).toHaveLength(2);
    expect(
      currentViews().map((view) => JSON.parse(view.configJson).textColor),
    ).toEqual(['#234567', '#234567']);

    mockTextColor = '#f4f5f6';
    // The theme stub has no subscription; force the memoized host to read it.
    await renderer.rerender(<ZhihuNativeContent {...props} options={{}} />);
    const views = currentViews();
    expect(views.map((view) => JSON.parse(view.configJson).textColor)).toEqual([
      '#f4f5f6',
      '#f4f5f6',
    ]);
    const attachments = views.flatMap(
      (view) => (JSON.parse(view.flowJson) as RichTextFlow).attachments,
    );
    expect(attachments.map(({ kind, url }) => ({ kind, url }))).toEqual([
      { kind: 'formula', url: inlineUri },
      { kind: 'formula', url: displayUri },
    ]);
    expect(JSON.parse(views[1].configJson).textAlign).toBe('center');
    expect(mockSvgProps.length).toBeGreaterThan(0);
    expect(mockSvgProps.every((svg) => svg.uri === imageUri)).toBe(true);
    expect(mockSvgProps.every((svg) => !svg.color && !svg.fill)).toBe(true);
  });

  it('uses its local skeleton without invoking the fallback while waiting or ready', async () => {
    const renderFallback = jest.fn(() => <Text>经典排版回退</Text>);
    const onLayoutReady = jest.fn();
    await render(
      <ZhihuNativeContent
        content='<p data-pid="p-one">原生正文</p>'
        objectId="staging-default"
        type="answer"
        renderFallback={renderFallback}
        onLayoutReady={onLayoutReady}
      />,
    );
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();
    expect(renderFallback).not.toHaveBeenCalled();
    expect(currentViews()).toHaveLength(1);
    const view = currentViews()[0];
    expect(screen.getByTestId(`native-flow-${flowId(view)}`)).not.toBeVisible();

    // Native estimates alone cannot reveal content before its host width exists.
    await heightEvent(view);
    expect(onLayoutReady).not.toHaveBeenCalled();
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();
    await containerLayout(view.contentWidth);
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(screen.getByTestId(`native-flow-${flowId(view)}`)).toBeVisible();
    expect(renderFallback).not.toHaveBeenCalled();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await heightEvent(view);
    await containerLayout(view.contentWidth);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
  });

  it('keeps a custom excerpt until every flow matches the current width and configuration', async () => {
    const renderFallback = jest.fn(() => <Text>经典排版回退</Text>);
    const renderPlaceholder = jest.fn(() => <Text>保留已读摘要</Text>);
    const onLayoutReady = jest.fn();
    const props = {
      content:
        '<p data-pid="p-one">第一段原生正文</p><hr><p data-pid="p-two">第二段原生正文</p>',
      objectId: 'staging-excerpt',
      type: 'answer' as const,
      renderFallback,
      renderPlaceholder,
      onLayoutReady,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    expect(screen.getByText('保留已读摘要')).toBeVisible();
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(currentViews()).toHaveLength(2);
    const firstWidthViews = currentViews();

    await containerLayout(320);
    const widthViews = currentViews();
    expect(widthViews.every((view) => view.contentWidth === 320)).toBe(true);
    await heightEvent(widthViews[0]);
    expect(screen.getByText('保留已读摘要')).toBeVisible();
    await heightEvent(widthViews[1], {
      layoutKey: firstWidthViews[1].layoutKey,
    });
    expect(screen.getByText('保留已读摘要')).toBeVisible();

    await renderer.rerender(
      <ZhihuNativeContent {...props} options={{ justify: true }} />,
    );
    const configuredViews = currentViews();
    await containerLayout(320);
    expect(configuredViews[0].configJson).not.toBe(widthViews[0].configJson);
    await heightEvent(configuredViews[1]);
    // A previously measured flow at the old config must be measured again.
    expect(screen.getByText('保留已读摘要')).toBeVisible();
    await heightEvent(widthViews[0]);
    await heightEvent(configuredViews[0], {
      layoutKey: widthViews[0].layoutKey,
    });
    expect(screen.getByText('保留已读摘要')).toBeVisible();
    await heightEvent(configuredViews[0]);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('保留已读摘要')).toBeNull();
    for (const view of configuredViews)
      expect(screen.getByTestId(`native-flow-${flowId(view)}`)).toBeVisible();

    await containerLayout(340);
    expect(screen.getByText('保留已读摘要')).toBeVisible();
    for (const view of configuredViews) await heightEvent(view);
    expect(screen.getByText('保留已读摘要')).toBeVisible();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    for (const view of currentViews()) await heightEvent(view);
    expect(screen.queryByText('保留已读摘要')).toBeNull();
    expect(renderFallback).not.toHaveBeenCalled();
    expect(onLayoutReady).toHaveBeenCalledTimes(2);
  });

  it('notifies block-only documents from their actual container layout', async () => {
    const onLayoutReady = jest.fn();
    const props = {
      content: '<hr>',
      objectId: 'staging-blocks',
      type: 'answer' as const,
      renderFallback: () => <Text>经典排版回退</Text>,
      onLayoutReady,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    expect(currentViews()).toHaveLength(0);
    expect(onLayoutReady).not.toHaveBeenCalled();
    await containerLayout(320);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    if (!screen.root) throw new Error('Missing renderer root');
    const staleLayout = screen.root.props.onLayout as (
      event: LayoutChangeEvent,
    ) => void;
    await containerLayout(320);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await renderer.rerender(
      <ZhihuNativeContent {...props} content="<hr><hr>" />,
    );
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await act(() =>
      staleLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 0 } },
      } as LayoutChangeEvent),
    );
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await containerLayout(320);
    expect(onLayoutReady).toHaveBeenCalledTimes(2);
  });

  it('keeps verified text mounted and visible when only reaction metadata changes', async () => {
    const onLayoutReady = jest.fn();
    const segmentInfo = {
      pid: 'p-one',
      text: '甲乙丙丁',
      marks: [
        {
          start_index: 0,
          end_index: 2,
          seg_info: {
            seg_ids: ['123'],
            is_like: false,
            like_count: 1,
            comment_count: 0,
          },
        },
      ],
    };
    const props = {
      content: '<p data-pid="p-one">甲乙丙丁</p>',
      objectId: 'staging-metadata',
      type: 'answer' as const,
      renderFallback: () => <Text>经典排版回退</Text>,
      onLayoutReady,
      segmentInfos: [segmentInfo],
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    await containerLayout(320);
    const before = currentViews()[0];
    await heightEvent(before);
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(mockNativeMounts.get(flowId(before))).toBe(1);
    await renderer.rerender(
      <ZhihuNativeContent
        {...props}
        linkCardInfo={{}}
        segmentInfos={[
          {
            ...segmentInfo,
            marks: [
              {
                ...segmentInfo.marks[0],
                seg_info: {
                  ...segmentInfo.marks[0].seg_info,
                  is_like: true,
                  like_count: 2,
                },
              },
            ],
          },
        ]}
      />,
    );
    const after = currentViews()[0];
    expect(after.layoutKey).toBe(before.layoutKey);
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(screen.getByTestId(`native-flow-${flowId(after)}`)).toBeVisible();
    expect(mockNativeMounts.get(flowId(after))).toBe(1);
    await heightEvent(before);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
  });

  it('keeps the revealed body and verified height when a refresh adds a knowledge mark', async () => {
    const onLayoutReady = jest.fn();
    const props = {
      content: '<p data-pid="p-one"><strong>甲乙丙丁</strong></p>',
      objectId: 'staging-new-mark',
      type: 'answer' as const,
      renderFallback: () => <Text>经典排版回退</Text>,
      onLayoutReady,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    await containerLayout(320);
    const before = currentViews()[0];
    await heightEvent(before, { height: 345 });
    const verifiedStyle = currentViews()[0].style;
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await renderer.rerender(
      <ZhihuNativeContent
        {...props}
        segmentInfos={[
          {
            pid: 'p-one',
            text: '甲乙丙丁',
            marks: [
              {
                start_index: 0,
                end_index: 2,
                seg_info: {
                  seg_ids: ['123'],
                  is_like: false,
                  like_count: 1,
                  comment_count: 0,
                },
              },
            ],
          },
        ]}
      />,
    );
    const after = currentViews()[0];
    expect(after.layoutKey).not.toBe(before.layoutKey);
    expect(after.style).toEqual(verifiedStyle);
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(screen.getByTestId(`native-flow-${flowId(after)}`)).toBeVisible();
    expect(mockNativeMounts.get(flowId(after))).toBe(1);
    await heightEvent(before, { height: 999 });
    expect(currentViews()[0].style).toEqual(after.style);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await heightEvent(after, { height: 350 });
    expect(currentViews()[0].style).toEqual({ width: 320, height: 350 });
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
  });

  it('keeps matching first-layout measurements while metadata updates another flow', async () => {
    const onLayoutReady = jest.fn();
    const props = {
      content: '<p data-pid="p-one">甲乙</p><hr><p data-pid="p-two">丙丁</p>',
      objectId: 'staging-partial-metadata',
      type: 'answer' as const,
      renderFallback: () => <Text>经典排版回退</Text>,
      onLayoutReady,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    await containerLayout(320);
    const before = currentViews();
    await heightEvent(before[0]);
    expect(onLayoutReady).not.toHaveBeenCalled();
    await renderer.rerender(
      <ZhihuNativeContent
        {...props}
        segmentInfos={[
          {
            pid: 'p-two',
            text: '丙丁',
            marks: [
              {
                start_index: 0,
                end_index: 1,
                seg_info: {
                  seg_ids: ['456'],
                  is_like: false,
                  like_count: 1,
                  comment_count: 0,
                },
              },
            ],
          },
        ]}
      />,
    );
    const after = currentViews();
    expect(after[0].layoutKey).toBe(before[0].layoutKey);
    expect(after[1].layoutKey).not.toBe(before[1].layoutKey);
    await heightEvent(before[1]);
    expect(onLayoutReady).not.toHaveBeenCalled();
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();
    await heightEvent(after[1]);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
  });

  it('uses the complete fallback only when the native module is unavailable', async () => {
    mockNativeAvailable = false;
    const renderFallback = jest.fn(() => <Text>经典排版回退</Text>);
    const renderPlaceholder = jest.fn(() => <Text>不应显示的摘要占位</Text>);
    const onLayoutReady = jest.fn();
    await render(
      <ZhihuNativeContent
        content="<p>正文</p>"
        objectId="staging-unavailable"
        type="answer"
        renderFallback={renderFallback}
        renderPlaceholder={renderPlaceholder}
        onLayoutReady={onLayoutReady}
      />,
    );
    expect(screen.getByText('经典排版回退')).toBeVisible();
    expect(renderFallback).toHaveBeenCalledTimes(1);
    expect(renderPlaceholder).not.toHaveBeenCalled();
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(currentViews()).toHaveLength(0);
    expect(onLayoutReady).not.toHaveBeenCalled();
  });
});
