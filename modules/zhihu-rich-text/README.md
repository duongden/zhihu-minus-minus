# ZhihuRichText Android 模块

Rich-content V2 的独立 Expo native view。业务入口由 `features/rich-content` 管理；本模块只接收序列化后的 `RichTextFlow`，不解析 HTML、不访问登录状态。

## 当前实现

- 一个 flow 对应一个 Android `TextView` 和一份 UTF-16 `Spannable`，段落分隔符、附件占位符均保留原始 offset。系统长按选择可以跨越这个 flow 内的段落。
- 粗体、斜体、下划线、删除线、背景高亮、上下标、等宽代码、链接，以及标题、引用线、列表缩进和段距。
- 根据 Android `Layout` 的实际视觉行绘制实线、虚线、点线和波浪线；软换行不会复用下一行的首个 caret 作为上一行终点。
- `ReplacementSpan` 表示 `U+FFFC` 附件。异步读取图片、HTTP(S) SVG 和 `data:image/…`，解析 SVG 根节点的 `ex`/`em` 尺寸与 `vertical-align`；同一动画帧完成的资源统一回填、保留选区并重新测量。
- 行高是最小值，附件较高时保留其完整 ascent/descent；宽度按容器上限缩小。系统复制会把已选中的附件占位符替换为 `copyText`。
- 统一字号、最小行高和段距；Android 高质量换行及可选系统双齐。没有通过插入空格或改变正文内容模拟中西文间距。
- 不使用 `LinkMovementMethod`。普通点击分发链接、知识点或附件 action；长按仍交给系统选择，附件可附加 `attachmentLongPress` 事件。
- 公式使用独立Paint，以当前 `textColor` 的SRC_IN滤镜绘制前景；普通图片保持原色。公式若在四个5%内缩角落中至少三个为近白不透明像素，加载时先转为灰度alpha mask去除浅底，避免底板和文字同时被染白。尺寸、基线和分类保持不变。
- 解码资源按kind、URL、尺寸、字号/系统缩放及容器宽度保留在进程LRU中，以bitmap.byteCount计数，缓存上限24MB。缓存保留未染主题色的glyph/mask，主题切换在绘制时着色；kind防止普通图复用公式mask。重新挂载的文字流可直接使用已缓存几何；资源失败不阻塞正文首测，也不输出资源URL。

## Props 与事件

`flowJson` 使用 `features/rich-content/richText.ts` 的 `RichTextFlow` 契约。原生会跳过越界 range、非单字符附件或没有 `U+FFFC` 的附件范围。标题优先使用 compiler 输出的 `fontSize`、`lineHeight` 和段落上下边距，与其他后端共享指标；旧 flow 缺少字号/行高时保留基础默认值。

`configJson` 支持 `fontSize`、`lineHeight`、`paragraphSpacing`、`textColor`、`secondaryColor`、`linkColor`、`justify` 和 `textAlign`（left/center/right）。尺寸以dp表达，文本、段距和附件应用系统 `fontScale`；`contentWidth` 为容器dp，不再乘 `fontScale`。`selectable` 控制系统选择。

JS props还必须提供 `layoutKey`，代表本次字体/宽度/配置输入。更新key会调度重测；高度去重包含key，原生posted measurement会核对当前key和generation，避免旧测量覆盖新布局。宿主应使用紧凑稳定key，不把整篇flow JSON重复塞入事件。

事件均附带 `flowId`、`textVersion`：

| 事件 | 额外字段 |
| --- | --- |
| `onSelectionChange` | `start`、`end`，UTF-16 offset；清除或折叠选择均为 `-1` |
| `onHeightChange` | `layoutKey`、`height`，dp；相同flow/version/layoutKey/height去重 |
| `onAction` | `kind`、`id`、`start`、`end`、可选 `url` |

JS 通过 `isRichTextNativeAvailable()` 探测原生模块；`RichTextNativeView` 仅在 Android 延迟加载。其他平台和未包含该模块的客户端，由上层选择 fallback。

信息流外层 `FeedExcerpt` 保留原有React Native `Text`，不调用此模块。正文预览宿主可在数据获取及首测期间保留其现有摘要placeholder。

## 当前边界

- 系统选择上下文限于一个 flow。块级图片、表格、卡片、视频等由上层插入，会形成 flow 的边界。
- 混合方向文本的装饰线目前使用每行的起止 caret，尚未分解所有 bidi visual runs。
- 没有 URL 的 LaTeX 显示公式占位符；不在本模块内运行 TeX 排版引擎。资源失败保留占位符，不记录资源 URL 或异常内容。
- SVG 只对根节点尺寸和 `vertical-align` 做基础解析；不实现浏览器 CSS cascade、DOM 选择、分页或完整 Tiqian 排版求解。
- 公式统一前景色是单色阅读策略，不保留彩色公式的分色语义；浅底检测是像素启发式，不是任意SVG背景结构识别。
- 标点压缩、悬挂、中西文独立空间预算尚未实现。双齐和禁则依赖当前 Android 系统文字布局行为，需在目标设备查看实际效果。
- 附件网络请求不携带应用 Cookie、签名或认证配置，不输出请求日志；读取超时为 8 秒，单资源上限为 4 MiB。
- 首载的可见性、骨架和预览动画由正文宿主管理。首测不等待所有附件请求；未知intrinsic尺寸加载后仍可能必要重排，缓存和按帧更新不等于完整布局已经一次完成。

2026-09-30：Android `assembleDebug`及vivo原型功能查看通过。2026-10-01：首载处理与短公式结构修复完成构建和真机确认。公式前景着色的mask边界及65,536组alpha/gray不变量通过纯Kotlin验证，匿名Ax=b图源为currentColor、无rect/image；最终Android prebuild和arm64 Debug构建通过（约10秒），新版APK更新安装后用户明确确认暗色公式修复。普通图片不着色由回归及native kind guard验证，未宣称所有图源已逐项真机检查。全仓检查及完整边界见[本轮记录](../../features/rich-content/docs/renderer-v2-experiment-03-native-flow.md)，未量化首载白闪，未验收Release性能、iOS adapter或跨设备一致性。
