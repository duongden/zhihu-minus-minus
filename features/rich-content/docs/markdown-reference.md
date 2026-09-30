# Zhihu++ Markdown 参考记录

本轮根据用户提供的本地 Zhihu++ 仓库补充 Renderer V2 内容模型。参考路径为 `shared/src/commonMain/kotlin/com/github/zly2006/zhihu/markdown/`，其中 `MdAst.kt` 负责 HTML/Markdown 转 AST，`RenderMarkdown.kt` 负责渲染与图片画廊，`MarkdownRuntime.kt` 负责平台字体和资源加载。知识点高亮另参考 `util/SegmentHighlightUtils.kt` 与 `ui/components/SegmentHighlight.kt`。

本模块的实际进度仍是类型草案、文档遍历和知识点属性的局部规范化；完整 HTML parser、Markdown parser、HTML 清洗、渲染后端和编辑器序列化尚未接入。

根据 [Issue #40 当前方向](https://github.com/huamurui/zhihu-minus-minus/issues/40) 和 [enriched-html / Tiqian 候选讨论](https://github.com/huamurui/zhihu-minus-minus/issues/40#issuecomment-5595047992)，这些参考用于中立语义层与后续 adapter。`ZhihuDocument` 不规定 WebView 或逐块虚拟化；native Text Flow Island / Rich Text IR 编译仍待实现。Zhihu++ 的 Tiqian 实践可帮助验证排版语义，本仓 RN/Expo 宿主、工具链与 iOS 路径还需独立 PoC。

## 结构映射

| 参考结构 | 当前模型 | 保留的语义 |
| --- | --- | --- |
| Table / TableHead / TableBody / TableRow / TableCell | `table.head/body/foot → row.cells → cell.blocks` | 表头/表体/表尾、标题、对齐、单元格合并与嵌套块 |
| FootnoteReference / FootnoteDefinition | `footnoteReference` + `document.footnotes` | 展示编号、定义稳定 ID、重复引用与独立定义内容 |
| Image / Figure | `inlineImage` / `image` | 段落内图文顺序、正文图、图注、尺寸与预览资源 |
| InlineCode / KeyboardInput | `inlineCode` / `keyboardInput` | 代码文本、键盘输入语义 |
| Strikethrough / Highlight / Subscript / Superscript | 对应格式容器 run | 嵌套行内格式；另外补充 `underline` |
| SegmentHighlight | `segmentHighlight` | 虚线划线、片段 IDs、跨段文本、反应、来源和交互位置 |
| NativeBlock 视频 | `video` + 可选 `videoId/resource` | 知乎业务 ID、页面地址、封面与可播放资源 |
| InlineMath / MathBlock | `inlineFormula` / `blockFormula` | 原始 LaTeX、图片资源以及行内/块级排版语义 |

视频等业务节点保留数据结构，平台加载和交互由 renderer 承担。资源模型只存 URL、尺寸、媒体类型和离线 URI；Cookie、请求头或认证数据属于资源加载器，不进入文档模型。

## 本轮可执行能力

- `walkZhihuDocument` 使用显式栈进行前序遍历，访问所有块/行内内容，包含图注、表格单元格和末尾脚注定义。脚注引用作为叶节点，不沿引用再访问定义。
- `getZhihuDocumentPreviewImages` 收集正文块图和行内图，以去掉首尾空白、补全协议后的 URL 去重，保留首次出现顺序。头像、公式、视频封面、卡片缩略图和非 HTTP(S) 图片不进入画廊；输出投影资源模型允许的字段。
- `parseZhihuSegmentHighlight` 从不确定属性对象中识别完整的 `highlight-wrap` class token，投影有效元数据。有效 wrapper 没有业务属性时仍返回空元数据，后续规范化器仍可生成视觉划线 run。

上述函数从模块公共入口导出，测试不依赖 React Native 或 WebView。它们目前供后续规范化链路使用，现有 RNRH/DOM 组件仍接收原始 HTML。

## 后续 normalization 约定

### 文本、标识与空白

普通文本需要保留两个行内格式节点之间的有效空白，避免合并成连写单词。代码块和行内代码需要保留原始换行与缩进，不能共用普通文本的空白折叠规则。

同一文档中的节点 ID 应唯一；重复解析相同输入应稳定。`paragraphId` 保留知乎 `data-pid`，`videoId` 保留业务 ID，脚注 `label` 保留展示编号，三者与节点 ID 分开。遍历顺序号不能当作原始 HTML 行号或全文选择偏移。

脚注定义只存一份。多次引用同一定义时保留不同的引用节点 ID，共用 `definitionId`。编号缺失、定义冲突或引用悬空时应产生规范化诊断与可见 fallback，不能直接数值转换后抛错或丢正文。

### 公式

原始 LaTeX 保持原样，包括空白、注释和转义；取 tex、识别排版和渲染是不同步骤。`eeimg=1` 默认保持 inline attachment，`eeimg=2` 保持块级公式；不能仅因旧 renderer 的能力限制把行内公式提升为 block。参考实现还识别 `\tag`、顶层 `align` 或顶层换行等真正的 display 语义，后续应通过 fixture 明确这些例外。矩阵环境内的换行不能一概升级为块公式。

参考实现另有超长公式提升为独立可滚动块的策略。阈值和段落拆分应在本项目 fixture 与真机基线上确定。本轮仅补充约定，尚未实现公式语义扫描或改变当前渲染行为。

### 知识点高亮

三种结构具有不同来源：普通 `highlight` 对应 `mark` 背景高亮；`segment` 对应接口 `segment_infos` 中的范围标记；`segmentHighlight` 对应已嵌入 HTML 的 `highlight-wrap` 划线。

业务元数据不完整时仍保留 `segmentHighlight.children`，不能把视觉划线降级为普通背景高亮。`target` 的内容 ID/类型与 `location` 的段落 ID/范围各自成组验证；计数缺失不等于 0，点赞状态缺失不等于 false。

局部属性解析只确认 offset 是非负安全整数且 `start < end`，空范围不会生成可交互位置。段落实际长度、端点越界和文本对应需要完整规范化层结合段落内容校验。

`displayText` 可以是跨段菜单/复制文本。当前片段的 `children` 和本段 UTF-16 半开范围 `[start, end)` 仍单独保留，不能依据全量 `displayText` 重算段内偏移。后续交互应根据具体动作验证目标、片段 IDs 和位置；缺失字段不能补造为空 ID 或 0 偏移。

### 容错与运行时边界

HTML 解析、链接协议验证、未知节点诊断和资源校验应集中在规范化层。一次解析所需的脚注与上下文应作为局部状态传递，避免全局可变文档状态影响并发处理。类型声明和局部属性解析不代表完成了 HTML 清洗。

各候选 backend 通过 adapter 复用 `ZhihuDocument` 的语义和资源边界。连续文字进一步编译为 Rich Text IR，由所选文本引擎负责排版；图片画廊与遍历仍复用同一套内容语义，平台字体、主题、选择宿主、资源请求和业务 mutation 留在运行时层。

编译层需将段落内 UTF-16 offset 映射为 flow 全局范围，保留插入的换行、列表标记与 `U+FFFC` attachment 占位。原生选择和知识点动作必须经 source map 返回原始节点/段落位置；现有段内范围和 WebView 选择类型不等于这一协议已经实现。文本 flow 合并和媒体边界的选择能力见 [Renderer V2 计划](./renderer-v2-plan.md)。
