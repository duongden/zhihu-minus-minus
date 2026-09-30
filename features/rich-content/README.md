# Rich content rendering

这个目录集中维护知乎富文本渲染的运行时代码、设计记录、真实内容样本、分析工具和回归测试。业务页面只从本模块的 `index.ts` 导入渲染能力，避免实现、样本和验证逻辑散落在仓库各处。

对应 GitHub Issue：[#40](https://github.com/huamurui/zhihu-minus-minus/issues/40)，当前路线已按正文与[候选后端补充](https://github.com/huamurui/zhihu-minus-minus/issues/40#issuecomment-5595047992) 同步为原生 attributed text / Text Flow Island。详细决策与验收见 [Renderer V2 计划](./docs/renderer-v2-plan.md)。

中文正文排版的规则优先级、Tiqian 源码依据、当前后端的低成本改进与完整实现难度，见 [Tiqian 排版策略评估](./docs/tiqian-typography-strategies.md)。本轮已修正共享字号/行高关系，并建立 [Native V2 功能原型](./docs/renderer-v2-experiment-03-native-flow.md)，可先逐项查看功能；性能验收后续推进。

## 目录

- `components/`：RNRH、WebView/DOM，以及 Native V2 的文字流/独立媒体 adapter；原生文字模块支持Android和iOS。
- `normalization/`：中立 HTML → `ZhihuDocument` 初步转换与危险节点/URL过滤。
- `docs/`：Renderer V2 架构、真机基准计划和阶段性结论。
- `fixtures/inbox/`：可以持续投递的脱敏知乎 API `.json` 样本。
- `fixtures/cases/`：已经登记精确期望值的稳定回归案例。
- `fixtures/manifest.json`：稳定案例的来源、特征、正文路径和结构/元数据断言。
- `tests/`：通过 Jest 运行的模型、属性/消息验证、fixture 和后端降级回归测试。
- `tools/`：内容复杂度分析和后续基准辅助工具。
- `types.ts`：当前正文和链接卡片组件的输入契约。
- `document.ts`：Renderer V2 的 `ZhihuDocument` / Block / InlineRun 语义类型。
- `richText.ts`、`compileRichText.ts`：连续文字流IR、媒体分界、范围样式、附件、装饰与选择source map。
- `tableLayout.ts`、`components/NativeTable.tsx`：表格占位网格、合并格、内容高度约束与横向滚动。
- `dev/prototypeCases.ts`：V2开发原型的合成内容。
- `documentTraversal.ts`：文档内容节点遍历和正文预览图片收集。
- `segmentHighlight.ts`：`highlight-wrap` 属性的局部规范化。
- `nativeInteractions.ts`：回答知识点与选区的完整身份、源范围/文本校验，以及不进入业务接口时的本地复制文本。
- `bridge.ts`：WebView 消息类型、文本选择结构与运行时字段验证。
- `queryPolicy.ts`：列表正文复用、统一查询 key 和 Pager 相邻预取策略。
- `index.ts`：供应用层使用的稳定公共入口。

仓库根目录的 `components/ZhihuContent.tsx` 和 `components/ZhihuDOMContent.tsx` 仅保留兼容转发，不再包含实现。新代码统一使用：

```ts
import { ZhihuContent } from '@/features/rich-content';
```

## 类型与数据边界

当前组件继续接收 HTML 字符串或想法分段数组。`ZhihuContentProps`、`LinkCardProps`、`RichContentObjectType` 从公共入口导出；`contentArray` 复用 `types/zhihu.ts` 的 `ZhihuContentSegment`，知识点元数据复用 `ZhihuSegmentInfo`、`ZhihuSegmentMark` 和 `ZhihuSegmentReaction`。单数 `RichContentObjectType` 表示正文对象，复数 `RichContentEntityType` 表示查询接口类型。

`normalizeZhihuDocument` 初步将HTML和知识点元数据转换为 `ZhihuDocument`，`normalizeZhihuContentSegments`处理想法的结构化text/image/link_card等分段，由 `compileZhihuDocument` 和 `native-v2` 后端消费。业务正文可通过持久设置选择该后端，开发页面也可显式覆盖。现有 RNRH / WebView 链路仍各自接收HTML，想法保留完整结构化fallback。该模型与知乎 API 原始 JSON 分开定义：

- `ZhihuBlock` 用 `type` 区分段落、标题、图片、块级公式、列表、引用、代码、视频、链接卡片、表格、分隔线和未支持结构。表格按表头、表体和表尾保留行/单元格，单元格支持对齐、合并跨度和嵌套 `blocks`。
- `ZhihuInlineRun` 覆盖文本、粗体、强调、下划线、删除线、高亮、上下标、行内代码、键盘输入、链接、行内图片/公式、脚注引用、两种知识点结构、换行和未支持结构。容器的 `children` 保留嵌套格式，列表项和引用的 `blocks` 保留块级嵌套。
- 节点具有稳定 `id`，文档和子节点数组只读。知乎 `data-pid` 单独存为 `paragraphId`，知识点 `range` 按 UTF-16 文本偏移使用半开区间 `[start, end)`。
- 图片/视频资源保存 URL、可选原始 URL、尺寸、MIME 类型和离线 URI。公式必须提供 LaTeX 或图片，`inlineFormula` 与 `blockFormula` 分开建模。
- 链接的 `kind` 保留普通链接、@ 提及和 # 话题语义；图片的 `role` 区分正文图与日报作者头像。
- `unsupported` 保留来源类型和纯文本 fallback，便于后续规范化测试识别遗漏；不把任意字符串并入 `type` 联合。
- 脚注定义只存于 `document.footnotes`，行内 `footnoteReference.definitionId` 指向定义的节点 ID。展示编号 `label` 与节点 ID 分开，允许多次引用同一定义。

Block AST 表达内容语义，不规定逐段 cell 或 FlashList 布局。`compileZhihuDocument` 已将连续的标题、段落、简单引用/列表编成共享UTF-16 buffer，并输出text/paragraph spans、独立decoration、inline attachment和source map。媒体/表格形成flow边界；同一flow可跨段选择，跨媒体选择尚未实现。`mapRichTextSelection` 把flow全局范围映回段落源位置，生成换行/列表符号不推进源偏移，U+FFFC复制时替换为语义文本。

行内公式还须与宿主容器中的相邻文字保持连续，不能只检查节点类型。列表、引用和裸div/root中的混合文本与公式现已一起进入段落，避免短公式虽标为inline却被单独包成paragraph。Android公式附件统一使用正文前景色；普通图片保持原色，识别出的浅色公式底板先转为前景alpha mask。该着色策略不保留彩色公式的分色语义。

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

类型声明不等于 HTML 清洗或 URL 安全验证；V2 normalization对节点、范围、资源和未支持结构做初步验证，完整知乎dialect仍需后续扩充。当前 `linkCardInfo` / `cardInfo` 属于外部数据边界，字段使用前按 `unknown` 验证，不能直接视为 `ZhihuLinkCardBlock`。

现有 WebView bridge 的 `RichContentBridgeMessage` 覆盖高度、图片点击/长按、链接、知识点和文本选择。消息先解码为 `unknown`，通过 `parseRichContentBridgeMessage` 验证字段后再派发；无效 JSON、未知消息和错误字段被忽略，不记录原始消息。选择范围使用 DOM 文本的 UTF-16 偏移，跨段落时起止 offset 分别属于各自段落。

该bridge仍仅服务WebView。独立Android/iOS模块提供带flowId/textVersion的选择、高度和action事件，JS校验当前IR身份后派发；滚动/ready/error协议尚未完整。`ZhihuContent` 默认读取正文后端设置，经典路径仍是RNRH，显式 `renderer` 优先于用户偏好。

Enriched组件、专属dialect normalizer、相关测试、依赖和native patch已于2026-09-30正式移除；[实验01](./docs/renderer-v2-experiment-01-enriched-html.md)仅保留历史研究，不再提供运行入口或fallback。Native V2在Android/iOS以外的平台或模块未包含的客户端回退到RNRH。

通常使用 `ZhihuContent` 让正文遵循持久偏好；需要固定后端时可显式传入 `renderer="native-v2"`。该外壳已经封装完整RNRH fallback及图片/链接交互。直接使用 `ZhihuNativeContent` 时必须提供 `renderFallback: () => React.ReactNode`，由宿主返回完整的RNRH正文adapter，仅供无模块/不支持平台降级；首次native测量使用同排版骨架或宿主placeholder，避免先显示经典正文再切换样式。模块本身无需反向依赖外壳。V2源选区和知识点事件仅在原生模块可用时生效。

## 真实正文的启用入口

“设置 → 外观与阅读 → 正文排版”提供经典排版（RNRH）、原生排版 V2（Native V2）、网页排版（WebView）。“功能开关 → 正文排版”也会进入同一页面。选择原生排版 V2后，普通业务正文即可采用新后端，无需进入开发案例。默认仍为经典排版；`richContentRenderer`在settings version 13中持久化，迁移旧 `useWebView=true` 为网页，其余旧值为经典。缺模块或不支持的平台按本次渲染回退RNRH，不改写保存的偏好。

信息流外层的 `FeedExcerpt` 按用户决定单独保留原有React Native `Text`摘要，不进入Native V2。长按预览在获取数据和正文首测期间可保留现有摘要placeholder，完成后显示所选正文后端；这不是独立的native摘要渲染入口。

`ZhihuContent` 的 `onLayoutReady` 用于正文首次布局就绪通知。Native后端在实际容器宽度和所有顶层flow的当前布局高度均确认后通知；回答详情据此开放阅读进度恢复。单纯知识点/反应元数据更新可沿用几何一致的已验证高度，避免正文再次退回占位。阅读进度同时等待就绪后的新contentSize，不能把数据已返回或短placeholder高度当作最终正文，持久数据格式不变。

真实回答中的知识点业务菜单接受两类精确验证的标记：当前 `segment_infos` 的段落ID、范围、源切片文本和现有reaction IDs均匹配；或者HTML `highlight-wrap`具有完整当前回答target、反应/片段ID和位置，且包裹内容对应唯一源段落。API或HTML中明确跨段、不完整或其他对象类型的标记仅提供本地复制与安全来源链接；跨段显示文本只在target和片段ID集合一致时用于本地复制。文章、想法和问题不调用回答专属reaction接口。

Native V2选区已接回回答的既有业务菜单，但仅开放可逐片验证源映射的普通正文/引用及相邻段落。必须具有唯一真实段落ID，若存在API段落文本也须全文一致；含附件、br、脚注、标题/列表、缺失或重复段落ID等情况保留系统选择和复制，不补造业务范围。业务动作的存在不代表已在本轮真机验证中提交API操作。

反应接口保留完整片段ID集合，并安全解析服务端新建segId。回答段评链接携带原始片段文本和完整段落/范围，当前评论页的根评论和直接回复才使用段评接口；旧链接缺少这些字段时仍可阅读，需重新选择原文后发段评。独立replies页沿用原有comment-ID回复流程，本轮未扩展。

真实知乎格式的补齐以现有RNRH/WebView实现及稳定fixtures为依据，具体覆盖与剩余边界见 [存量案例审计](./docs/renderer-v2-experiment-03-native-flow.md#存量知乎格式审计)。合成演示与真实API格式分别验证，不能仅凭页面中出现“脚注”或“卡片”就认定已覆盖知乎的属性和元数据格式。

## 常用命令

```bash
npm run analyze:rich-content
npm run analyze:rich-content:inbox
npm test -- features/rich-content/tests --runInBand
```

第一个分析命令校验 manifest 中的稳定案例；带 `inbox` 的命令递归扫描新投递文件，只输出结构统计，不要求先维护 manifest。对于完整知乎 API JSON，案例通过 `contentPath` 选择正文，同时可以用 `expectedMetadata` 覆盖作者、问题、徽章、反应、权限、截断状态、@ 提及和 # 话题等正文之外或 HTML 属性之外的行为输入。

## 开发构建案例页

开发构建可从“我的 → 富文本测试案例（开发）”打开案例列表，再进入“V2 功能原型”。原型使用六组合成内容，提供Native V2、RNRH、WebView三后端对照、字号/行高/排版和装饰调节、源选区面板与本地知识点菜单，不提交业务操作。稳定fixture页读取 `fixtures/manifest.json`，也可切换这三个后端；这些切换仅影响当前案例，不写入生产正文偏好。正文交互默认关闭，临时打开后需注意样本可能保留真实对象ID。

开发deeplink可用 `zhihu--:///dev/rich-content/prototype?caseId=attachments` 选择合成案例；caseId只接受页面六个已知标识，忽略无效值，不接受URL中的任意HTML。iOS CLI模拟器命令见 [开发指南](../../DEVELOPMENT.md)。

三个后端统一经过 `ZhihuContent` 的交互外壳，复用站内/站外链接分流、内容宽度、图片预览及共享排版指标。Android/iOS V2模块直接消费IR，初步支持选择事件、自定义装饰和行内附件；完整附件几何和无障碍映射仍需后续验收。Native V2需要重新生成并编译development build，不能运行于Expo Go；模块缺失时可继续用RNRH查看内容。

本轮Android V2已完成prebuild、arm64 Debug构建及vivo真机功能查看；Enriched移除前后的验证记录与未验证项见 [实验03](./docs/renderer-v2-experiment-03-native-flow.md)。iOS新增UIKit/TextKit初步adapter，其构建与平台验证另行记录；尚无双端Release验证。Tiqian保留为[历史集成草案](./docs/renderer-v2-experiment-02-tiqian.md)，是否需要接入取决于后续系统布局能力的实际缺口。

案例页只展示已经登记到 `fixtures/cases/` 与 manifest 的稳定样本，`inbox/` 不会直接进入 UI。新增并登记 JSON case 后，Metro 的 fixture context 会自动发现文件，不需要再修改页面注册表。生产构建不显示入口，直接访问 `/dev/*` 也会被重定向到首页。

## 当前范围

项目已经完成测试集集中、Android Debug 基线、正文复用和 Pager 相邻预取，并新增中立normalization、Rich Text IR、Android文字流功能原型及初步iOS UIKit/TextKit adapter。Enriched运行链路已正式删除，Native V2已提供真实正文的用户可选入口。双端完整平台验收、完整知乎覆盖、跨媒体选择、媒体生命周期与Release对照仍待完成，新安装默认仍是经典排版。

真机试用后优先推进Native V2。RNRH继续维护经典正文与迁移fallback；WebView保留为用户可选后端及开发对照。

下一阶段按 [Renderer V2 迁移计划](./docs/renderer-v2-plan.md) 推进：

1. 先根据Android真机反馈完善选择、装饰线、行内附件、知识点和媒体交互。
2. 扩充现有 `ZhihuDocument` normalization、Rich Text IR与source map的真实内容覆盖。
3. 验证并完善Native V2的iOS adapter与双端一致性；仅在系统布局存在明确缺口时再评估Tiqian接入。
4. 后续补齐纯文本、样式密集与混合媒体矩阵，并管理媒体viewport生命周期；文本分段/虚拟化由 [Release 基准](./docs/benchmark-plan.md) 决定。
5. 基于双端验收结果选择默认 backend，经 feature flag 逐步接管，达到替换条件后移除 RNRH。

RNRH 保留为当前实现、对照和迁移期 fallback；WebView 保留为 fallback/实验。桌面微基准、已有 Debug 数据和第三方实践不能代替本仓 native backend 的真机验收。
