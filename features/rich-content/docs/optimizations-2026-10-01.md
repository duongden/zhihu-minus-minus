# 2026-10-01 富文本优化专项

## 度量身份计算

原实现对每对相邻 span 端点扫描全部度量 span。内部 `flowLayout.ts` 改为端点事件扫描和活跃索引树，按原输入顺序枚举活跃样式，保留重叠、重复样式和相邻等价区间合并；paint、action 与 sourceMap 不进入几何身份。

`dense-metric-spans-001` 是合成的 16 段正文，编译成一个 flow、8,224 个度量 span。运行 `node features/rich-content/tools/benchmark-flow-layout.mjs`，先逐段断言输出一致，再各测七轮中位数。2026-10-01 本地 Node 25.8.0 结果：旧算法 88.66 ms，新算法 6.40 ms，约 13.85 倍。回归另以固定随机种子覆盖 200 组交叠、重复、空区间和相邻样式。该数值仅衡量桌面 JS 身份计算，不代表原生布局或 Release 首载性能；大量深度交叠本身仍需要枚举活跃样式。

## KaTeX 离线资源

WebView 原先从 CDN 读取 KaTeX 0.16.9，而应用依赖已锁定 0.16.47。现在从已安装依赖生成同版脚本、auto-render、CSS 和 20 份 WOFF2 字体，字体全部使用 data URL，公式无需请求 CDN。旧 DOM 公式组件继续使用该依赖的 renderToString，共用离线 CSS，不引入新的业务公共入口。

生成 JSON 总大小为 664,889 字节（约 649 KiB，含 MIT license），CSS/runtime 拆分避免旧 DOM bundle 携带不使用的浏览器 runtime。此数值是生成文件原始大小，最终平台 bundle/IPA 压缩增量须从构建产物测量。`postinstall` 自动生成；`npm run generate:rich-content:katex` 显式更新；`node features/rich-content/tools/bundle-katex.mjs --check` 校验可重现性。离线回归直接在无网络 VM 执行本地 runtime 排版分式和根式，并检查所有 font face 的 data URL、安装版本一致性及 WebView 无外链脚本。

`offline-formula-001` 可从开发案例页切换 WebView 查看行内/块级公式。正文 HTML 仍经清洗，KaTeX trust 保持默认 false；不承诺任意 TeX 命令或外部图片离线可用。

## 原生附件和范围

双端原生行内附件按滚动 viewport 上下各一屏预取，离屏/卸载/后台取消该 view 的请求订阅、释放图像引用而保留尺寸。重复资源继续共享加载器和 24 MiB 进程缓存；Android 内存压力回调清缓存。迟到结果须匹配文档 generation 与可见性 revision。首次未知 intrinsic 尺寸仍允许必要重排，文字流保持连续。

Android JSON range 从 optInt 改为严格数值整数，拒绝字符串、boolean、非有限值、越界及 UTF-16 surrogate pair 中点，与 iOS 对齐；选区、action、装饰、附件和复制共用校验，只有单个 U+FFFC 可以替换为语义 copyText。Swift Foundation smoke 为 28 项断言；Android 纯 JVM 测试覆盖同类输入与离屏取消/重入状态。Android 离线 prebuild 后使用 JDK 17.0.18、SDK 36 编译 `:zhihu-rich-text:testDebugUnitTest`，12 个测试通过（8 个请求协作、2 个 viewport、2 个范围/复制用例）。

该轮实现与纯逻辑验证不替代双端实际滚动、选区、无障碍、内存驻留和 Release 性能验收。平台构建与真机结果在仓库整体审查记录中单独登记。
