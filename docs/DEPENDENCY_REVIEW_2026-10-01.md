# SDK 55 依赖、安全告警与 Firebase SPM 评估

评估日期：2026-10-01。本记录针对当前锁文件，不代表其他 Expo SDK 或之后发布的依赖版本。结论是保留下面五组 patch 更新，为 URL 解码器回植官方安全修复，继续使用已验证的 Firebase CocoaPods/static 构建方式，同时保留可复现的 SPM 迁移检查。此次评估没有修改依赖版本或锁文件。

## Expo 推荐版本偏差

`EXPO_OFFLINE=1 npx expo install --check` 返回非零，并指出下表六个包的版本偏差；React 与 React DOM 作为一组维护。离线检查本身提示结果可能不可靠，这里另外核对了安装的 `expo/bundledNativeModules.json`、锁文件、peer 范围和官方 release。

| 依赖 | 当前锁定 | SDK 55 推荐 | 保留依据 |
| --- | --- | --- | --- |
| FlashList | 2.0.3 | 2.0.2 | 同一 2.0 系列 patch，修复 Jest mock 返回 undefined；没有新增架构切换。[官方 release](https://github.com/Shopify/flash-list/releases/tag/v2.0.3) |
| React / React DOM | 19.2.8 / 19.2.8 | 19.2.0 / 19.2.0 | 两者保持一致；RN 0.83.10 的 React peer 是 `^19.2.0`，React DOM 19.2.8 的 peer 是 `^19.2.8`。19.2.8 的说明涉及 Server Components 解码性能，不将它描述成客户端安全修复。[官方 release](https://github.com/react/react/releases/tag/v19.2.8) |
| Reanimated | 4.2.3 | 4.2.1 | 包含 Android draw pass 提交修复以及 peer/Worklets 校验更新；当前 RN 0.83.10、Worklets 0.7.4 分别落在它声明的 `0.80 - 0.84`、`0.7 - 0.8` 范围内。[4.2.3](https://github.com/software-mansion/react-native-reanimated/releases/tag/4.2.3)、[4.2.2](https://github.com/software-mansion/react-native-reanimated/releases/tag/4.2.2) |
| SVG | 15.15.5 | 15.15.3 | 包含 Apple `currentColor` 透明度和 Android Mask/LinearGradient 等修复；没有借此升级 RN 或 Expo SDK。[官方 release](https://github.com/software-mansion/react-native-svg/releases/tag/v15.15.5) |
| WebView | 13.16.2 | 13.16.0 | 13.16.1 修复 iOS nil NSString 转换引起的 SIGABRT，13.16.2 修复导航决策管理的线程安全。这两项与登录和正文 WebView 的可靠性相关，回退会丢掉修复。[13.16.1](https://github.com/react-native-webview/react-native-webview/releases/tag/v13.16.1)、[13.16.2](https://github.com/react-native-webview/react-native-webview/releases/tag/v13.16.2) |

这些更新来自已合并的月度 patch 提交 `c98f0f4`；后续 `18b16fc` 只将 PagerView 8.0.5 回退到 SDK 推荐的 8.0.0，并未回退上述包。因此，偏差有明确的来源和范围，并非锁文件漂移。Expo 的推荐值是集成基线，peer 范围和 patch 标签也不能单独证明原生运行正常；本轮全量质量门禁与 iOS/Android 编译结果见 [CR 记录](./CODE_REVIEW_2026-10-01.md)。

React 官方已说明，不使用服务器或支持 RSC 的框架/插件的应用不受 CVE-2025-55182 影响。本项目当前是 Expo 原生客户端和静态 Web 输出，未启用 RSC；锁文件中出现的是 Expo/Metro 的可选 peer 声明，没有安装 `react-server-dom-*` 包。不能以该漏洞为理由声称当前原生客户端受影响，也不能将保留 19.2.8 等同于完成服务端安全审计。[React 安全公告](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components)

不为消除警告添加 `expo.install.exclude`，保留后续升级时的可见提醒。只有发现对应平台的可重现回归、Expo 发布更明确的兼容限制，或进行完整 SDK 升级时，再重新选版本。SDK、RN、React 与 `expo-*` 的主版本仍按统一升级流程处理。

## npm audit 与实际调用边界

本轮 `npm ci` 后执行 `npm audit --json --ignore-scripts`，结果是 22 个受影响包条目（16 moderate、6 high）。这不是 22 个独立漏洞：high 条目都来自 `@grpc/grpc-js`，moderate 条目来自 `decode-uri-component` 和 `uuid`，其余是父依赖传播。`@grpc/grpc-js` 另有一条 low 公告，包条目按最高严重度统计。审查没有执行 `npm audit fix --force`，也没有使用版本降级来消除告警。

| 根依赖与公告 | 当前来源及调用边界 | 处理 |
| --- | --- | --- |
| `@grpc/grpc-js` 1.9.16：[GHSA-m9gg-hp2v-232j](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j)，另有 [GHSA-f596-whhp-79r4](https://github.com/grpc/grpc-node/security/advisories/GHSA-f596-whhp-79r4) | RNFirebase App/Analytics 26.4.0 → `firebase` 12.17.1 → Firestore 4.17.0/compat → Node gRPC。高危触发条件是 Node gRPC 服务端关闭强制客户端证书校验，并用 `getAuthContext` 的结果鉴权；另一条公告涉及服务端 handler 的错误消息。当前业务与构建脚本没有导入 Firestore、运行 gRPC 服务端或调用该鉴权 API；应用使用的是 RNFirebase 原生 Analytics。这些条件与原生 Firebase SDK 的版本是不同边界。 | 保留告警记录，未发现当前原生客户端可达的服务端攻击路径。官方修复版本为 1.13.6 / 1.14.5，超出 Firestore 的 `~1.9.0` 约束，不能当作同范围 patch 覆盖。后续采用上游兼容修复版本；若增加 Node Firestore/gRPC 服务端，必须先处理此项并重新审查。 |
| `decode-uri-component` 0.2.2：[GHSA-vcc3-ghjq-m6fr](https://github.com/SamVerschueren/decode-uri-component/security/advisories/GHSA-vcc3-ghjq-m6fr) | Expo Router 55.0.18 → CommonJS `query-string` 7.1.3。坏百分号编码可让旧解码器耗费过量 CPU。它会进入 JS bundle，但当前 Router 入站查询解析使用 `URL.searchParams`（`getStateFromPath-forks.js`），两个 `query-string` 调用只做 `stringify`，没有证明恶意深链可调用漏洞函数；仓库业务也没有直接调用它。 | 新增 `patches/decode-uri-component+0.2.2.patch`，回植官方 0.5.0 的逐字节 UTF-8 解码扫描，删除旧递归拆分算法，保留 CommonJS 导出、旧 `+` 转空格及 BOM/不完整编码兼容行为。修复潜在依赖调用的耗时问题，不宣称已经存在可利用的应用攻击链。 |
| `uuid` 7.0.3：[GHSA-w5hq-g745-h8pq](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq) | 来自 prebuild/config plugin 的 `xcode` 3.0.1。公告涉及 `v3`/`v5`/`v6` 传入外部 buffer 时缺少范围校验；当前 xcode 只调用无外部 buffer 的 `uuid.v4()`，不使用这些方法。 | 保留构建依赖告警。修复线为 11.1.1、12.0.1、13.0.1，不能直接以跨主版本 override 代替 xcode/Expo 的兼容升级。若新增受影响方法或调用方传入外部 buffer，需先完成修复。 |

解码器补丁来自 [官方 0.5.0 源码](https://github.com/SamVerschueren/decode-uri-component/blob/v0.5.0/index.js)，只替换扫描算法，未升级包或改变原生依赖图。0.5.0 是 ESM；`query-string` 7.1.3 需要 `require('decode-uri-component')` 直接返回函数，因此不能盲目覆盖成 0.5.0。npm 元数据中 7.1.3 是 query-string 7 的最后一个发布版本，8.0.0 也已切换 ESM。现有 `postinstall` 的 `patch-package` 自动应用回植；`tests/url.test.ts` 中一个回归通过真实 Node CommonJS 和 query-string 验证正常 UTF-8、空格/加号、BOM、损坏编码及有超时保护的长坏编码，避免测试进程卡住。

本轮 `npm ci` 已成功，确认 postinstall 自动应用解码器补丁；`npm test -- tests/url.test.ts --runInBand` 的 16 个测试通过，改动测试通过只读 Biome。隔离基线验证中，旧解码器处理同一长坏编码样本在 1 秒后被超时终止，回植版在边界内完成；这证明回归覆盖了实际耗时问题，并非只检查实现文本。

补丁不改变锁文件版本，`npm audit` 仍会报告上述 22 个条目；它不会读取 patch-package 的代码差异，不能将这次回植描述为 audit 已清零。解码器上游修复被 Expo Router 兼容依赖链正式采用，并通过 Node、Metro、冷/热启动链接验证后，再删除本地补丁。其他告警等待上游兼容版本与相应 prebuild/原生门禁，不能接受 audit 建议的 Expo 46、Router 5 或 RNFirebase 20 等跨 SDK 降级。

## Firebase SPM

Firebase 官方计划在 2026 年 10 月停止向 CocoaPods 发布新版本，已有版本仍可安装、运行。迁移是为了继续接收后续修复和功能，而非现有包会在该日期突然失效。[官方迁移说明](https://firebase.google.com/docs/ios/cocoapods-deprecation)

当前锁定 React Native Firebase App/Analytics 26.4.0，二者版本一致，其默认 Apple SDK 为 12.18.0。本地 `firebase_spm.rb` 已支持 RN 的 `spm_dependency`，同时明确拒绝 SPM 与 static linkage 的组合：Firebase 的自动链接产品会被多个静态 consumer 重复嵌入，导致重复符号。当前 `app.json` 使用 `useFrameworks: static`、`forceStaticLinking: [RNFBApp, RNFBAnalytics]` 及 `disableSPM: true`；自定义 `withIosFirebaseCocoaPods` 也维护 CocoaPods 标记。迁移必须同时调整这些边界。[RNFirebase 26.4.0 集成源码](https://github.com/invertase/react-native-firebase/blob/v26.4.0/packages/app/firebase_spm.rb)

隔离评估在自行创建的 `/tmp/zhihu-spm-review-*` 工程进行，只使用合成 Firebase plist；没有复制 `.env` 或真实服务配置，没有修改当前 `ios/`。候选配置：

- 删除候选工程中的 `withIosFirebaseCocoaPods` 插件，关闭 RNFirebase `disableSPM`。
- 改为 dynamic linkage，移除 RNFBApp/RNFBAnalytics 的强制静态链接；仅为 React 预编译基础组件保留静态例外。
- 保留无广告标识 Analytics 产品和 Scene 初始化插件。
- 使用 `EXPO_NO_DOTENV=1`、显式开启候选 Firebase，并关闭 Sentry 上传。

候选 iOS prebuild 已成功。生成的 Podfile 未包含 `RNFirebaseDisableSPM`，`Podfile.properties.json` 为 dynamic linkage；pod 安装日志已选择 `FirebaseCore`、`FirebaseInstallations` 和无 IDFA 的 `FirebaseAnalyticsCore` SPM 产品。随后 `pod install` 失败：CocoaPods 拒绝 `Pods-app` 对静态二进制 `React-Core`、`ReactNativeDependencies`、`React-RCTAppDelegate` 的传递依赖。这证明 SDK 55 当前的 RN 预编译链路不能直接通过更换链接选项迁移。

第二个隔离候选额外设置 `buildReactNativeFromSource: true` 并删除 React 的强制静态例外，clean prebuild 和 `pod install` 均成功，安装 142 个 pods。生成的 app/Pods 工程包含 Firebase 12.18.0 SPM 引用，RNFirebase 的 framework 嵌入与重复签名修复阶段，以及 app target 对 `FirebaseCore` 的直接链接。源码构建可由 SDK 55 的 [`expo-build-properties`](https://docs.expo.dev/versions/v55.0.0/sdk/build-properties/) 配置表达，不需要手工修改生成的工程或绕过 CocoaPods 校验。

这次验证证明源码构建候选能够生成并整合依赖图；尚未进行 Swift Package 下载解析、Release archive、签名安装或真机运行。迁移会同时改变 React Native 构建模式和 framework 链接方式，不能只删除 `disableSPM`。当前保留正式配置，后续迁移需评估源码构建耗时与 CI 缓存，并完成下面的门槛。

## 正式迁移的门槛

正式切换应在独立变更中完成 Firebase 开/关两种 clean prebuild、公开包解析、Release archive 和签名安装，确认 RNFirebase 自动添加的 SPM framework 嵌入阶段及重复签名修复阶段有效，并保存对应的 `Package.resolved` 策略。随后验证 Scene 初始化、离线启动、关闭统计后不采集、重新开启后的行为及冷/热启动链接。合成配置可以证明构建集成，无法证明真实 Firebase 后端事件接收；后者必须使用授权测试配置，且不得在日志或截图中输出配置和凭据。

出现只能经 SPM 获得的必要 Firebase 安全修复、CocoaPods 依赖解析失败，或统一 Expo SDK 升级时，优先安排正式迁移。当前不直接切换应用的链接方式；依赖图整合成功仍不足以证明候选可以发布。
