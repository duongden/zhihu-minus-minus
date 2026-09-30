# Rich content rendering

这个目录集中维护知乎富文本渲染的运行时代码、设计记录、真实内容样本、分析工具和回归测试。业务页面只从本模块的 `index.ts` 导入渲染能力，避免实现、样本和验证逻辑散落在仓库各处。

对应 GitHub Issue：[#40](https://github.com/huamurui/zhihu-minus-minus/issues/40)，当前路线已按正文与[候选后端补充](https://github.com/huamurui/zhihu-minus-minus/issues/40#issuecomment-5595047992) 同步为原生 attributed text / Text Flow Island。详细决策与验收见 [Renderer V2 计划](./docs/renderer-v2-plan.md)。

## 目录

- `components/`：当前 RNRH 渲染器和已有 WebView/DOM 实验实现；迁移期间作为旧链路与参考。
- `docs/`：Renderer V2 架构、真机基准计划和阶段性结论。
- `fixtures/inbox/`：可以持续投递的脱敏知乎 API `.json` 样本。
- `fixtures/cases/`：已经登记精确期望值的稳定回归案例。
- `fixtures/manifest.json`：稳定案例的来源、特征、正文路径和结构/元数据断言。
- `tests/`：不依赖 React Native 运行时的 fixture 回归测试。
- `tools/`：内容复杂度分析和后续基准辅助工具。
- `types.ts`：当前正文和链接卡片组件的输入契约。
- `document.ts`：Renderer V2 的 `ZhihuDocument` / Block / InlineRun 类型草案。
- `documentTraversal.ts`：文档内容节点遍历和正文预览图片收集。
- `segmentHighlight.ts`：`highlight-wrap` 属性的局部规范化。
- `bridge.ts`：WebView 消息类型、文本选择结构与运行时字段验证。
- `queryPolicy.ts`：列表正文复用、统一查询 key 和 Pager 相邻预取策略。
- `index.ts`：供应用层使用的稳定公共入口。

`components/ZhihuContent.tsx` 和 `components/ZhihuDOMContent.tsx` 仅保留兼容转发，不再包含实现。新代码统一使用：

```ts
import { ZhihuContent } from '@/features/rich-content';
```

## 类型与数据边界

当前组件继续接收 HTML 字符串或想法分段数组。`ZhihuContentProps`、`LinkCardProps`、`RichContentObjectType` 从公共入口导出；`contentArray` 复用 `types/zhihu.ts` 的 `ZhihuContentSegment`，知识点元数据复用 `ZhihuSegmentInfo`、`ZhihuSegmentMark` 和 `ZhihuSegmentReaction`。单数 `RichContentObjectType` 表示正文对象，复数 `RichContentEntityType` 表示查询接口类型。

`ZhihuDocument` 是下一阶段规范化层的类型草案，目前没有 HTML → Document 转换器，现有渲染器也还没有消费该模型。它与知乎 API 原始 JSON 分开定义：

- `ZhihuBlock` 用 `type` 区分段落、标题、图片、块级公式、列表、引用、代码、视频、链接卡片、表格、分隔线和未支持结构。表格按表头、表体和表尾保留行/单元格，单元格支持对齐、合并跨度和嵌套 `blocks`。
- `ZhihuInlineRun` 覆盖文本、粗体、强调、下划线、删除线、高亮、上下标、行内代码、键盘输入、链接、行内图片/公式、脚注引用、两种知识点结构、换行和未支持结构。容器的 `children` 保留嵌套格式，列表项和引用的 `blocks` 保留块级嵌套。
- 节点具有稳定 `id`，文档和子节点数组只读。知乎 `data-pid` 单独存为 `paragraphId`，知识点 `range` 按 UTF-16 文本偏移使用半开区间 `[start, end)`。
- 图片/视频资源保存 URL、可选原始 URL、尺寸、MIME 类型和离线 URI。公式必须提供 LaTeX 或图片，`inlineFormula` 与 `blockFormula` 分开建模。
- 链接的 `kind` 保留普通链接、@ 提及和 # 话题语义；图片的 `role` 区分正文图与日报作者头像。
- `unsupported` 保留来源类型和纯文本 fallback，便于后续规范化测试识别遗漏；不把任意字符串并入 `type` 联合。
- 脚注定义只存于 `document.footnotes`，行内 `footnoteReference.definitionId` 指向定义的节点 ID。展示编号 `label` 与节点 ID 分开，允许多次引用同一定义。

Block AST 表达内容语义，不规定逐段 cell 或 FlashList 布局。后续需要把可连续排版的节点编译成 Text Flow Island / Rich Text IR，保留 text/paragraph spans、独立 decoration、inline attachment 和 source map；这些编译结构尚未定义或实现。知识点的段内 UTF-16 范围与 flow 全局范围不同，换行和 attachment 占位也须参与映射。

模型补充参考了 Zhihu++ 的 Kotlin Markdown AST、图片画廊和知识点高亮处理，映射与规范化约定见 [Markdown 参考记录](./docs/markdown-reference.md)。`segment` 对应接口 `segment_infos` 的范围标记；`segmentHighlight` 对应 HTML `highlight-wrap` 的划线；普通 `highlight` 对应 `mark` 的背景高亮。高亮业务元数据可缺省，缺少交互目标或位置时仍保留视觉结构，不用空 ID 或 0 偏移补造提交数据。跨段 `displayText` 用于菜单/复制，不替代本段偏移坐标系。

最小文档示例：

```ts
import type { ZhihuDocument } from '@/features/rich-content';

const document = {
  id: 'answer:example',
  blocks: [
    {
      id: 'paragraph:one',
      type: 'paragraph',
      paragraphId: 'one',
      children: [
        { id: 'text:one', type: 'text', text: '公式：' },
        {
          id: 'formula:one',
          type: 'inlineFormula',
          formula: { latex: 'E = mc^2' },
        },
      ],
    },
  ],
} satisfies ZhihuDocument;
```

`walkZhihuDocument(document)` 按前序遍历内容块和行内节点，覆盖列表、引用、表格单元格、图注和末尾脚注定义。它使用显式栈，不沿脚注引用重复遍历定义；文档、列表项、表格行/单元格、脚注定义等结构容器本身不被返回。

`getZhihuDocumentPreviewImages(document)` 从该遍历中收集块图和行内图，按规范后的 HTTP(S) URL 去重并保留首次出现顺序。头像、公式图、视频封面、卡片缩略图和非 HTTP(S) URL 不进入正文画廊；`//` URL 规范为 HTTPS，输出只保留资源模型中的字段。

`parseZhihuSegmentHighlight(attributes)` 验证 `highlight-wrap` 的字段并投影为 `ZhihuSegmentHighlightMetadata`；未识别 wrapper 返回 `null`，已识别但没有有效元数据返回 `{}`。计数、布尔值和完整业务目标分别验证；位置仅校验非负安全整数以及 `start < end`，段落边界与文本对应仍需后续 normalization 校验。非法字段被省略，`displayText` 保留原始空白。这个函数只处理已提取的属性，不负责 HTML 解析或业务请求。

类型声明不等于 HTML 清洗或 URL 安全验证；节点 ID、范围、资源和未支持结构由后续 normalization 验证。当前 `linkCardInfo` / `cardInfo` 仍属于外部数据边界，字段使用前按 `unknown` 验证，不能直接视为 `ZhihuLinkCardBlock`。

现有 WebView bridge 的 `RichContentBridgeMessage` 覆盖高度、图片点击/长按、链接、知识点和文本选择。消息先解码为 `unknown`，通过 `parseRichContentBridgeMessage` 验证字段后再派发；无效 JSON、未知消息和错误字段被忽略，不记录原始消息。选择范围使用 DOM 文本的 UTF-16 偏移，跨段落时起止 offset 分别属于各自段落。

该 bridge 是现有 WebView 路径的字段验证，不包含 V2 native 选择、滚动或 ready/error 协议。`ZhihuContent` 的 `useNative` 分支目前仍是 RNRH `RenderHtml`，不是新的原生 attributed-text backend。

## 常用命令

```bash
npm run analyze:rich-content
npm run analyze:rich-content:inbox
npm test -- features/rich-content/tests --runInBand
```

第一个分析命令校验 manifest 中的稳定案例；带 `inbox` 的命令递归扫描新投递文件，只输出结构统计，不要求先维护 manifest。对于完整知乎 API JSON，案例通过 `contentPath` 选择正文，同时可以用 `expectedMetadata` 覆盖作者、问题、徽章、反应、权限、截断状态、@ 提及和 # 话题等正文之外或 HTML 属性之外的行为输入。

## 当前范围

项目已经完成测试集集中、Android Debug 基线、列表正文复用、长按预览复用和 Pager 相邻回答预取，并建立内容类型、遍历与局部属性验证。新的原生 backend、完整 normalization 和 Release 对照尚未完成。

下一阶段按 [Renderer V2 迁移计划](./docs/renderer-v2-plan.md) 推进：

1. 补齐 10 万 / 30 万 / 50 万字纯文本、样式密集与混合媒体的正确性/性能矩阵。
2. 建立完整 `ZhihuDocument` normalization，并编译连续 text flow、Rich Text IR 与选择 source map。
3. 验证 `react-native-enriched-html` 双端候选和 Tiqian Android native module / adapter 候选，核实覆盖、工具链与 iOS 路径。
4. 在同一 flow 内验收跨段选择、装饰线和真正的 inline attachment；优先管理媒体 viewport 生命周期，文本分段/虚拟化由 [Release 基准](./docs/benchmark-plan.md) 决定。
5. 基于双端验收结果选择默认 backend，经 feature flag 逐步接管，达到替换条件后移除 RNRH。

RNRH 保留为当前实现、对照和迁移期 fallback；WebView 保留为 fallback/实验。桌面微基准、已有 Debug 数据和第三方实践不能代替本仓 native backend 的真机验收。
