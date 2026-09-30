# Renderer V2：原生富文本能力与逐步迁移

## 当前决策与来源

本计划于 2026-09-30 对照 [Issue #40 正文](https://github.com/huamurui/zhihu-minus-minus/issues/40) 和 [候选路线补充](https://github.com/huamurui/zhihu-minus-minus/issues/40#issuecomment-5595047992) 更新。Issue 正文是当前目标，早期评论中“单 WebView 原型、随后 Block FlashList”的路线作为历史记录保留。

继续逐步替换 `react-native-render-html`（RNRH），核心改为原生 attributed text 能力：连续文本流、可组合的 range 样式、自定义装饰线、行内 attachment，以及可回传到 JS 的选择范围。WebView 可用于对照、fallback 或实验；文本虚拟化由 Release 数据决定。优先验证媒体加载和回收，不把逐段 cell 作为必选架构。

目标链路：

```text
知乎 HTML / 想法分段
  -> 清洗、规范化、资源分类
  -> ZhihuDocument（语义 Block + InlineRun）
  -> Text Flow Island 分组 + Rich Text IR 编译
  -> backend adapter
       ├─ Native Rich Text
       │    ├─ Android：Spannable + TextView/Layout
       │    └─ iOS：NSAttributedString + UITextView/TextKit
       ├─ 独立媒体 / 复杂 block
       │    └─ 图片、视频、表格、卡片、自定义组件
       └─ 可选 fallback / 实验
            └─ RNRH、WebView 或其他 backend
```

具体 backend 尚未选定。当前优先验证 `react-native-enriched-html` 与 Tiqian 两条候选路线；本分支已有 Enriched 初步接入与开发对照入口，但完整能力和真机验收未完成，Tiqian 尚未接入。

## 当前实现与能力缺口

业务页面的 `ZhihuContent` 仍沿用 RNRH / WebView 设置，另有自动增高、关闭内部滚动的 `ZhihuDOMContent` 实验路径。组件的 `useNative` / native fallback 分支实际调用 `RenderHtml`，不能据此认定已接入新的原生 attributed-text backend。开发案例页可显式选择 `enriched`，不改变生产默认 renderer。

目前已经完成：

- runtime、脱敏 API JSON fixtures、分析工具、测试和文档集中维护。
- 完整免费回答正文复用、长按预览复用、Pager 相邻预取及未聚焦正文延迟挂载。
- [Android Debug 网络与挂载基线](./android-device-baseline-2026-08-30.md)。
- [`ZhihuDocument` 类型草案](../document.ts)，包括表格、脚注、行内图片/公式与知识点结构。
- [`documentTraversal.ts`](../documentTraversal.ts) 的文档遍历和正文图片收集，以及 [`segmentHighlight.ts`](../segmentHighlight.ts) 的属性局部规范化。
- [`bridge.ts`](../bridge.ts) 对现有六类 WebView 消息的字段验证。
- EnrichedText JS/Fabric 接入、三后端开发案例页、共享链接/图片预览外壳与排版指标，以及 SVG 解码和 `lineHeight` 的 native patch。
- Enriched 专属 dialect 降级及危险 URL/标签、图片来源与尺寸 fallback 的回归用例；fixture 工具支持 `question_feed_card` 与 `segment_infos` 范围/元数据校验。

完整 HTML → Document 转换、HTML 清洗、Rich Text IR、Text Flow Island 编译、基于中立模型的原生 adapter 和 V2 事件协议仍待实现。`normalizeZhihuHtmlForEnriched` 输出后端专属 HTML dialect，不是上述中立转换或 source map；当前块图/公式和媒体仍在该 dialect 内表达或降级，并未完成独立 block adapter。现有 WebView 的高度/图片/链接/知识点/选择消息验证，也不代表原生选择、滚动、ready/error 协议已完成。

[Enriched 实验记录](./renderer-v2-experiment-01-enriched-html.md) 保留 2026-09-14 的 Android Debug app 和 iOS Simulator library target 编译结果。历史构建记录不能替代合并后依赖/patch 的 prebuild、构建与真机检查；selection range 事件、自定义 decoration、精确 attachment baseline、source map 和双端 Release 对照仍未完成。[Tiqian 手册](./renderer-v2-experiment-02-tiqian.md) 则保留为待核验草案，其示例 API/Document V0 不是当前公共模型。

### 自定义文字装饰

当前知识点样式最终受 RN `Text` 暴露的能力限制。V2 需要以 source range 定义颜色、粗细、baseline 下方偏移和 solid/dashed/dotted/wavy 线型，并与链接、粗体、背景等样式独立组合。

native backend 的 PoC 应验证能否利用 Android Layout / iOS TextKit 的视觉行几何绘制跨行装饰；精确命中、字号变化与重新布局也必须覆盖。不能仅凭库支持普通 underline 就视为满足要求。

### 连续选择与 Text Flow Island

多个独立 `Text` / TextView 或可回收 cell 会形成不同的 selection context。连续、能够由 attributed-text 模型表达的段落应编译到同一个文本面，例如以换行连接标题、段落、简单列表与引用，并用范围样式表达语义。

Text Flow Island 是一段共享文本 buffer、范围坐标和选择上下文的连续正文。图片、视频、表格、复杂卡片或独立 box layout 可以形成边界；普通 `p`、`span`、粗斜体、链接、行内代码、换行、标题、简单列表/引用和行内 attachment 优先留在 flow 内。

首阶段验收同一 flow 内跨段选择。跨独立 flow 或媒体边界的文章级选择、复制与无障碍顺序需要单独验证并记录能力边界；不能默认逐段虚拟化后仍有连续选择。

### 真正的行内 attachment

`eeimg=1` 优先保持行内公式语义；`eeimg=2` 保持块级公式。小图片、emoji/icon 等行内对象也应参与同一个文本布局，不能用横向 `View` 拼接模拟。

Rich Text IR 可用 `U+FFFC` replacement character 表达 attachment，并保留尺寸、baseline offset、alignment、资源和原始节点身份。PoC 应验证 Android replacement span 或 iOS text attachment 路径的实际测量、换行和交互能力。

公式需要独立的视觉 baseline，不能只按图片矩形居中。还需覆盖字号/行高变化、ascent/descent、异步 intrinsic size 的 placeholder/reflow、前后选择 offset、点击/长按和 accessibility。公式语义升级的参考见 [Markdown 记录](./markdown-reference.md#公式)，不得因为旧 renderer 只能渲染 block 就把行内公式强制提升。

## ZhihuDocument 与 Rich Text IR 的边界

`ZhihuDocument` 保留知乎语义、原始节点 ID、`paragraphId`、局部知识点范围、资源、脚注和 fallback。它的 Block 数组既可编译成连续文本流，也可驱动独立媒体；存在 Block AST 本身不意味着必须使用 FlashList。

Rich Text IR 是下一层待实现的布局输入，至少需要：

| 结构 | 责任 |
| --- | --- |
| Text buffer | 每个 flow 的连续字符串和明确的文本版本 |
| Text spans | 在范围上应用字体、粗斜体、颜色、背景、链接等样式 |
| Paragraph spans | 段落范围、间距、缩进、对齐、列表/引用语义 |
| Decorations | 独立的范围装饰：颜色、粗细、offset、线型 |
| Inline attachments | 占位范围、资源/公式、尺寸、baseline、alignment、节点 ID |
| Source map | flow 全局范围与原始节点、段落 ID、段内偏移的对应 |

范围统一使用 UTF-16 半开区间 `[start, end)`。现有知识点/选择结构是段内 offset，不能直接当作 flow 全局 offset。编译时加入的换行、列表标记、attachment 占位必须纳入 source map；复制 attachment 时使用何种替代文本也需要明确规则。

原生选择事件需返回 flow 身份、对应文本版本及稳定范围，再由 source map 转回业务段落位置。文本更新、字号或宽度变化时，应避免旧选择范围指向新内容；emoji、组合字符、Bidi、换行和 attachment 前后位置均需 fixture 覆盖。

本项目负责 HTML/CSS 语义、range/paragraph 样式、装饰、attachment 和交互映射。基础 shaping、断行、Bidi、字体 fallback 和选择宿主由所选 backend 承担；不另行实现完整排版引擎。

## 两条候选路线

以下定位与风险来自 [Issue 路线补充](https://github.com/huamurui/zhihu-minus-minus/issues/40#issuecomment-5595047992)，属于待验证方案。

| 候选 | PoC 接入方式 | 重点待验证项 |
| --- | --- | --- |
| `react-native-enriched-html` | 用其原生 attributed-text surface 表达 text flow，知乎特殊节点先规范化，复杂内容保留独立 block/fallback | HTML/CSS 覆盖、跨段选择事件、公式密集内容、attachment/baseline metrics、自定义 decoration，以及必要 patch 的维护成本 |
| Tiqian | Android 正文经本地原生模块接入；中立模型由 adapter 转成其 article/paragraph 输入，RN 负责页面状态和导航 | RN 宿主的测量/滚动/手势/生命周期、CJK 与公式排版、文章级选择、工具链和最低系统要求、iOS 对应路径 |

`react-native-enriched-html` 是较轻量的双端候选，不能直接视为 RNRH 的完整替代。Tiqian 可参考 Zhihu++ 的正文实践，但已有 Kotlin 应用的能力不能直接证明 RN/Expo 宿主集成成立。

本仓库当前为 Expo SDK 55 / RN 0.83。Issue 提醒 Tiqian 工具链与后续 RN/Expo 基座的关系，正式接入前应对照本仓锁文件和所选上游版本要求逐项核验 Kotlin、AGP、Compose、JDK 与最低系统版本。该讨论不构成本仓已兼容或需要立即升级 SDK 的结论。

若评估 WebView，保留每个详情页至多一个、必要资源离线打包和清洗/导航边界的约束；多段/多公式 WebView，以及持续高度测量的自动增高结构，不能作为已验收的 V2 backend。

## 性能策略：先测文本，优先管理媒体

先补 10 万、30 万、50 万字的纯文本 fixture，以及大量 inline spans / paragraph styles 的变体。与图片、视频、公式附件和复杂 block 分开测试，区分 buffer、编译、layout/reflow、React/Fabric 节点与解码资源成本。`pig.json` 的长图混合案例不能代替纯文本上限。

Release 数据应覆盖首屏、measure/layout、字号和宽度变化后的 reflow、长距离滚动、native/Java heap 或 iOS 对应内存、attributed-text/layout cache 和 selection 响应，详见 [基准计划](./benchmark-plan.md)。

媒体优先研究 viewport 附近预加载、进入时挂载/解码、远离后释放位图或视频资源，保留可恢复尺寸占位。inline attachment 的尺寸和选择映射也须稳定，不能为回收小附件而先拆开连续文本流。

只有数据证明文本布局或内存超出目标，才进一步研究 flow segmentation、lazy paragraph layout、分段 surface、Block 虚拟化或其他 backend。实验需同时量化性能收益和 selection/复制/无障碍的代价。

## 迁移阶段

### Phase A：基线与中立模型

- [x] 集中 runtime、fixtures、工具和文档。
- [x] 登记 API JSON 案例与结构/元数据断言。
- [x] 完成 Android Debug 网络与挂载基线。
- [x] 定义 `ZhihuDocument` 类型草案、遍历、图片收集及知识点属性验证。
- [x] 验证现有六类 WebView 消息字段。
- [ ] 补纯文本上限、复杂 inline、表格/脚注、恶意 HTML 和深层嵌套案例。
- [ ] 实现完整 HTML normalization / 清洗与语义 fixture 断言。
- [ ] 建立跨 Android/iOS 的 RNRH 视觉与交互对照矩阵。

### Phase B：Rich Text IR 与候选 PoC

- [x] Enriched 初步 JS/Fabric 接入、后端专属 dialect、SVG/lineHeight patch 与三后端开发对照入口。
- [ ] 定义 text/paragraph spans、decorations、attachments 和 source map。
- [ ] 实现 Text Flow Island 分组与连续 UTF-16 buffer 编译。
- [ ] 在合并后工具链重新构建并完成 `react-native-enriched-html` 双端真机 PoC 验收。
- [ ] 核验 Tiqian 工具链并验证 Android 宿主/adapter PoC，记录 iOS 路径。
- [ ] 验证同一 flow 跨段选择、原生事件映射、自定义装饰及 attachment baseline/reflow。
- [ ] 与详情 header/Pager/底栏验证测量、滚动、手势和生命周期。

### Phase C：Release 对照与 backend 决策

- [ ] 对候选、当前 RNRH 和必要 fallback 运行相同 fixture 矩阵。
- [ ] 记录双端 Release 长文本、span 密集和混合媒体数据。
- [ ] 基于覆盖、性能、维护成本与平台差异选定默认 backend。
- [ ] 用 feature flag 分批接入回答/文章，保留可观测 fallback。
- [ ] 验证媒体 viewport 生命周期；数据有必要时再开展文本分段/虚拟化实验。

### Phase D：默认接管与移除旧链路

- [ ] 两端视觉、选择、字号、暗色、链接、媒体、知识点和无障碍验收通过。
- [ ] Release 数据与 fallback 覆盖满足验收，平台差异有明确处理。
- [ ] 默认启用已验证的 V2 backend。
- [ ] 达到替换条件后删除 RNRH renderer、兼容转发与依赖。

## 第一阶段验收

- `eeimg=1` 默认保持 text flow 内行内语义，已确认的 display 语义按 fixture 例外处理；`eeimg=2` 保持块级语义。附件排版、baseline、换行和异步尺寸变化正确。
- Android/iOS 原生正文在同一 flow 内支持跨段选择，并向 JS 暴露可映射的稳定范围。
- 装饰支持颜色、粗细、offset 与至少一种自定义线型，能够跨视觉行绘制并与其他 span 组合。
- 普通段落、标题、链接、粗斜体、颜色、背景和段落样式可组合，复杂媒体/block 有明确边界。
- 未支持节点保留可见 fallback 与诊断；HTML 清洗、危险 URL、事件边界和导航有自动化测试。
- 相同设备/内容的 Release 首屏、reflow、滚动、内存和选择数据可重复比较。
- 媒体生命周期与文本选择能够协作，文本虚拟化是否需要由 benchmark 决定。

Debug 数据、桌面 Node 微基准、第三方示例或仅定义类型，均不能代替本仓原生 backend 的真机验收。
