# 开发指南

本文面向需要在本地运行、调试、测试或扩展知乎--的开发者。用户安装说明见 [`README.md`](./README.md)，Windows Android 原生构建的网络和 Gradle 细节见 [`BUILD_WINDOWS.md`](./BUILD_WINDOWS.md)。

## 技术基线

- Node.js 22.x、npm；CI 和发布工作流固定使用 Node.js 22。
- Expo SDK 55、React Native 0.83、React 19、严格模式 TypeScript。
- Android：JDK 17、Android SDK、ADB 或模拟器；项目当前使用 Android API 36、NDK 27.1。
- iOS：macOS、Xcode、CocoaPods；最低部署版本为 iOS 15.1。
- 应用必须使用 Development Build 或 Release 原生包，Expo Go 不包含项目所需的原生模块。

## 首次启动

```bash
git clone https://github.com/huamurui/zhihu-minus-minus.git
cd zhihu-minus-minus
npm ci
npx expo prebuild
```

`android/`、`ios/` 和 `.expo/` 是生成物，不提交到仓库。`prebuild` 会应用 Expo config plugins，包括 ABI split、App 图标、iOS Firebase static linkage 和自定义原生模块配置。

本地开发不需要 Firebase 文件或 Sentry DSN。若要验证 telemetry，在项目根目录创建 `.env.local`，按 [`docs/TELEMETRY.md`](./docs/TELEMETRY.md) 配置；不要把 `google-services.json`、`GoogleService-Info.plist` 或 Token 提交到 Git。

## 运行与调试

### Android

确保设备或模拟器已连接并能被 `adb devices` 识别：

```bash
npm run android
```

如果已经安装好 Development Build，只启动 Metro：

```bash
npm run start -- --dev-client
```

Windows 用户请先阅读 [`BUILD_WINDOWS.md`](./BUILD_WINDOWS.md)；其中还记录了命令行 SDK、Gradle 镜像、ABI 和 Sentry 本地构建的常见问题。

### iOS

```bash
npm run ios
```

首次或修改原生依赖后：

```bash
npm run prebuild -- --platform ios
(cd ios && pod install)
npx expo run:ios --configuration Debug --device
```

需要真机 Release 验证时，在 Xcode 打开生成的 `ios/*.xcworkspace`，选择自己的 Team 后构建。Release IPA 是未签名的，不能替代签名流程。

只生成本地未签名 IPA 可运行 `bash build-unsigned-ipa.sh`。脚本每次执行 iOS prebuild（`--no-install`）后安装 Pods，自动发现唯一 workspace 和 scheme，禁用本地 Sentry 上传，并把当前版本 IPA 写入项目根目录。它不会改写 `.xcode.env.local` 或删除其他版本产物；已有同版本 IPA 在构建和打包成功后替换。产物已被 Git 忽略，仍需另行签名才能安装。

使用 Xcode 27 / iOS 27 SDK 时，UIKit 要求采用 Scene 生命周期，否则应用会在创建界面前退出。当前 SDK 55 由 [`withIosSceneLifecycle`](./plugins/withIosSceneLifecycle.js) 在 prebuild 时迁移窗口启动，并注入 [`ZhihuSceneDelegate.swift`](./plugins/ios/ZhihuSceneDelegate.swift)：以 `UIWindow(windowScene:)` 创建单个主窗口，将冷/热链接与前后台事件转给原有 Expo AppDelegate。生成目录无需手改；插件拒绝覆盖未知模板或已有自定义 Scene 配置，升级 Expo SDK 时须重新核对此适配。平台依据见 [Apple 迁移说明](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle) 与 [Expo Scene 说明](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md)。

开启 Firebase 时，其 config plugin 会先在旧窗口和 React 启动代码之间插入初始化块。Scene 迁移保留这个已知生成块及平台条件，让 `FirebaseApp.configure()` 继续在 AppDelegate 的 `didFinishLaunchingWithOptions` 中执行一次，再由 Scene 创建窗口并启动 React。未知初始化仍拒绝自动迁移。修改此适配时运行 `npm test -- tests/ios-scene-lifecycle.test.js --runInBand`，并分别验证开启和关闭 telemetry 的干净 iOS prebuild；只重用本地已迁移的 `ios/` 不足以覆盖 CI。

### Web

```bash
npm run web
```

Web 适合检查路由和不依赖原生模块的页面，不代表 Android/iOS 的原生行为已经验证。

## 什么时候需要重新 prebuild

以下改动后应重新生成原生工程：

- `app.json`、`app.config.ts` 或 Expo config plugin；
- `package.json` 中的原生依赖、`modules/` 下的本地原生模块；
- 原生权限、intent filter、iOS deployment target、Firebase 或 Sentry 构建配置；
- App 图标资源或 ABI split 配置。

只改 `app/`、`components/`、`features/`、`hooks/`、`api/`、`store/`、`storage/`、`utils/` 中的 TypeScript/样式时，通常只需要 Fast Refresh。不要直接把生成目录中的修补提交回仓库；如果配置需要长期保留，应写入 `app.config.ts` 或 config plugin。

## 验证命令

提交前运行聚合检查：

```bash
npm run check
```

它依次执行类型检查、只读 Biome 检查、全部 Jest 测试和富文本 fixture 分析。测试运行在 `jest-expo` preset 下；当前 `testMatch` 收集 `tests/` 下的 `.test.ts` / `.test.tsx` / `.test.js`，以及 `features/rich-content/tests/` 下的 `.test.ts` / `.test.tsx`。组件交互断言可使用 React Native Testing Library；其他目录或扩展名需要同步调整 `jest.config.js`。常用命令如下：

```bash
npm run typecheck
npm run lint
npm test
npm run test:watch
npm run test:coverage
npm test -- tests/themeMode.test.js --runInBand
npm test -- features/rich-content/tests/fixture-analysis.test.ts --runInBand
npm run analyze:rich-content
npm run analyze:rich-content:inbox
```

本地macOS具备Swift工具链时，可运行 `bash modules/zhihu-rich-text/tests/run-model-smoke.sh`，直接编译并检查iOS纯Foundation模型的UTF-16范围、非法输入和附件语义复制。它不加载UIKit，不替代iOS app编译、装饰/附件视觉及系统手势验收。

`npm run lint` 不修改文件；需要自动修复时使用 `npm run lint:fix` 或 `npm run format`，然后逐项检查 diff。富文本专项的 fixture 投递、脱敏和 manifest 规则见 [`features/rich-content/README.md`](./features/rich-content/README.md)。

### 主要界面回归场景

主要界面的代码回归覆盖分页、搜索提交、评论上传与提交、历史选择、账号切换和公共菜单。修改这些流程后，除运行 `npm run check`，还应在 Android/iOS Development Build 上检查以下场景；自动化逻辑测试不能替代原生布局和手势验收：

- 首页、搜索和日报：快速点击历史词/建议词、切换分类、刷新过程中触底、分页失败后重试，以及过滤/曝光去重后整页为空。服务端返回结束标记或重复游标时应停止追加。
- 回答、文章、想法和评论：分别验证首次失败、分页失败、排序切换、多行输入和图片输入栏。评论提交期间不得重复发送或清空新编辑；移除图片、重新选择同图及离页后，旧上传结果不得回填。想法多选投票应遵守选择上限、一次提交完整选项，提交及刷新期间不可重复发送。
- 问题与回答顶部：页顶导航透明，问题页显示返回与右侧更多按钮，回答页顶部保留返回，完整问题标题在正文中；接近折叠边界的最后 48px 随滚动逐渐显示背景、紧凑标题与作者，背景高度与信息位置同步变化。回答导航保留作者小头像和姓名，其顶部更多操作问题、正文底栏更多操作当前回答；横向切页按回答 ID 直接恢复展开/折叠及渐显进度，取消横滑、列表重排、离屏页滚动及旧回调不得污染当前页，切换问题或排序时清空本次导航状态。右侧自绘滚动条只作位置提示，不拦截手势，需检查短文隐藏、长文顶部/底部、弹性过滚、恢复进度、旋转及大字体后比例与导航间距。回归见 `answer-pager-transition`、`detailNavigationHeader`、`detailHeaderAppearance`、`readingProgress` 和 `scrollIndicator`。
- 回答相邻预加载：前台回答详情立即预取前后各一条完整回答，数据就绪后提前挂载正文；预加载本身不触发收藏查询或阅读进度恢复。切页时保留提升为当前页或仍在相邻窗口中的请求，只取消离开窗口且没有活跃查询的请求。未阅读的预热正文移出窗口后卸载，再次进入需重新确认原生布局就绪。真机需检查慢网下提前请求、请求未完成时快速左右切换、列表追加/重排及三种正文排版；回归见 `answerPrefetchResources`、`answerNeighborRendering` 和 `answer-pager-transition`。
- 内容操作菜单：Feed、创作卡片与问题/回答/文章/想法详情的更多入口统一为 `···`；收藏、系统分享链接、分享标题与链接、复制链接、复制 Markdown 及作者编辑/删除均为一级操作。Feed 长按复用同一动作构建，菜单关闭后再执行系统分享，内容身份或账号变化、离页和关闭中的连续点击不得执行旧动作。验证未知收藏状态读取/失败重试、游客登录入口、收藏请求禁用、日报和文章链接区分、复制返回失败与分享取消。回归见 `contentActionsMenu`、`contentActions`、`clipboard`、`detailPageMoreMenus`、`collectionAction`、卡片复用和 overlay 测试；真机需覆盖 iOS/Android 分享目标、剪贴板权限、长菜单滚动与弹窗关闭动画。
- 历史、收藏和用户列表：验证带连字符的历史标识、视频/问题跳转、长按选择、重复删除、刷新与翻页互斥，以及游客入口和账号切换后的状态。
- 个人主页：自己与他人主页的“创作”均通过 `useUserCreations` 读取最近发布流，使用资料返回的 member ID；与 `stream` 入口共享查询、分页去重和刷新逻辑。“我赞同过”通过 `useUserAnswersVotedByMe` 读取 `/members/{url_token 或 id}/relations/vote`，返回当前登录账号赞同过的该主页用户的回答，游客显示登录入口。首次访问标签时请求，固定 `sort_by=created`，从 `paging.next` 读取 offset 并按回答 ID 去重；查询 key 包含目标用户与当前认证会话版本，刷新只精确重置该查询。标签与顶部栏的数量来自 `paging.totals`，表示当前账号赞同过该用户的回答数，卡片展示回答作者。封面与顶部栏复用 `ProfileCover`，使用相同完整图像尺寸，顶部副本上移 112px 后固定，再渐入固定半径的模糊图层。顶部搜索图标进入 `/user/[id]/search`，主页不再内嵌搜索框。回归测试见 `userCreations`、`userAnswersVotedByMe`、`profileScroll`、`profileCover`、`profileTabList`、`profileHeader`、`userProfileScreen` 和个人搜索测试。原生验收需覆盖空/短/长列表、头部半展开时双向切换、封面缩至顶部栏后的固定与模糊、深滚动后返回页顶再切换、我赞同过列表的首次失败与分页失败重试、游客登录入口及账号切换后的缓存隔离、回答与作者跳转、搜索输入与清空及返回原主页位置、简介展开收起、横屏及大字体；标签栏和导航栏按实际高度定位，列表应保持阅读位置，搜索页应保持输入焦点。
- 话题、专栏和消息：话题结构页下拉应刷新父话题、子话题和最佳回答者；专栏刷新应回到首批文章；通知和私信长用户名不得挤掉时间，分页失败应提供重试。
- 发布和登录：小屏、横屏及大字体下四个发布入口均可滚动到达；回答邀请链接携带查询参数或结尾斜线时仍进入正确问题；搜索/邀请请求失败应区分于空结果；登录加载期间仍可取消。
- 公共菜单和对话框：使用长文案、多操作项和白色/黄色自定义主色，检查滚动、操作可达性、按钮文字对比度，以及关闭动画期间连续选择只执行第一次操作。更新说明的嵌套滚动也需要双端验证。

上述检查只使用合成内容；真实接口、系统选图和键盘行为需在目标平台另行验证，不将真实账号、正文或登录 URL 写入测试与截图。

富文本后续路线按 [Issue #40](https://github.com/huamurui/zhihu-minus-minus/issues/40) 更新为原生 attributed text / Text Flow Island，实施进度与未完成项见 [Renderer V2 计划](./features/rich-content/docs/renderer-v2-plan.md)，Release指标见 [基准计划](./features/rich-content/docs/benchmark-plan.md)。“设置 → 外观与阅读 → 正文排版”提供经典排版、tiqian-super-mini、网页排版三选项；“功能开关 → 正文排版”也会进入同一页面。业务 `ZhihuContent` 默认读取持久偏好，也可显式传 `renderer` 覆盖。从“我的 → 富文本测试案例（开发）”进入功能原型或稳定fixture，可对照这三个后端；案例内切换仅保留于该页面，不写生产偏好。生产构建隐藏开发入口并重定向 `/dev/*`，但真实正文仍可通过设置选择tiqian-super-mini。开发包另有 `zhihu--:///dev/native-validation` 合成验证页，检查 AES、原子文件、恢复、流式哈希、离线公式及原生长文布局；结果文件只含时间戳和布尔值，不能导出真实账号或密钥。

新增的 [tiqian-super-mini 功能原型](./features/rich-content/docs/renderer-v2-experiment-03-native-flow.md) 经过 HTML → `ZhihuDocument` → Rich Text IR → 本地 `modules/zhihu-rich-text`，初步支持同一流跨段选择、source map、装饰和行内附件。入口为上述案例列表的“tiqian-super-mini 原型”，也可在开发构建打开 `zhihu--:///dev/rich-content/prototype`。Android使用TextView/Spannable，iOS新增UIKit/TextKit adapter，两端共享Document、IR与JS交互宿主。未包含该模块或不支持的平台回退到RNRH。新增或变更模块后，对目标平台运行 `npx expo prebuild --platform android --no-install` 或 `npx expo prebuild --platform ios --no-install`，并重新编译/安装development build；Fast Refresh不能添加原生模块，Expo Go不支持此能力。iOS SVG解码依赖由本地podspec声明，prebuild后需安装Pods。

iOS最低版本继续为15.1。[expo-router补丁](./patches/expo-router+55.0.18.patch)为原有 `UIAction.subtitle` 赋值增加iOS16可用性守卫，避免当前SDK在默认target下编译失败；15.x仅省略此action副标题。补丁由现有postinstall的patch-package应用，无需改生成Pods工程或提高全局最低系统版本。

已安装development build并连接Metro的iOS模拟器可直接打开合成案例：

```bash
xcrun simctl openurl booted 'zhihu--:///dev/rich-content/prototype?caseId=attachments'
```

`caseId`限页面内的selection、decorations、attachments、segments、media、typography六个合成案例；忽略无效值，初次打开默认selection，其他query不注入正文。开发URL解析只保留合法且不超过64字符的caseId，生产构建继续隐藏和重定向开发页面。CLI可用于启动和截图，不能据此宣称系统选区拖柄、附件长按或父滚动手势已人工验收。

公共推荐入口为 `ZhihuContent`，默认采用用户正文偏好，需要固定后端时可传 `renderer="native-v2"`；该外壳已封装完整RNRH fallback。直接使用 `ZhihuNativeContent` 必须提供 `renderFallback` callback，由宿主返回完整正文与图片/链接交互；HTML 宿主使用 RNRH，结构化宿主使用 JSON 分段组件。V2选区和知识点事件仅在native模块可用时生效。

`structured_content` 的渲染对照位于“我的 → 富文本测试案例 → structured_content 渲染对照”。独立 `ZhihuStructuredContent` 直接按 JSON 分段展开收起，可比较 React Native 分段节点和 tiqian 原生文本流。后者直接向 `ZhihuNativeContent.document` 传递 `ZhihuDocument`；未提供该属性时，原 HTML normalization 路径保持不变，结构化模式在缺少原生模块时回退分段节点。五个主要案例来自附件中的真实回答，保持全部分段、marks 与分页状态，身份、ID、业务链接和不透明上下文已脱敏；公开正文与公式图片地址保留并在运行时加载，图片不下载进仓库。原附件缺少真实续页，另有合成案例演示追加；测试页不请求正文或互动接口、不更改持久阅读设置。样本来自 `features/rich-content/fixtures/inbox/structured-content/`，原始请求与字段结构见 [next-render 记录](./docs/ZHIHU_NEXT_RENDER.md)。

正文后端偏好保存为 `richContentRenderer`，默认 `rnrh`。settings持久化版本递增到13，并从旧 `useWebView` 迁移：原值为true时保留网页排版，否则使用经典排版，不静默替用户开启tiqian-super-mini。原生模块缺失或平台不是Android/iOS时，只对本次渲染回退RNRH，保留用户选择供可用客户端继续使用。

2026-09-30按用户决定正式移除Enriched：组件、专属normalizer与测试、依赖、native patch和开发入口均已删除，研发集中到本地tiqian-super-mini。[Enriched 实验记录](./features/rich-content/docs/renderer-v2-experiment-01-enriched-html.md)仅保留研究与历史构建依据。原生依赖移除后需用锁文件安装依赖，重新prebuild、编译和真机检查，以免旧生成工程继续链接已移除的库。2026-10-01增加iOS原生adapter、Expo Apple模块注册和共享JS入口；初期平台结果见实验03，后续双端Release构建、合成页面与系统交互的覆盖范围见 [本轮审查记录](./docs/CODE_REVIEW_2026-10-01.md)，完整平台验收仍需逐项推进。Tiqian保留为[历史集成草案](./features/rich-content/docs/renderer-v2-experiment-02-tiqian.md)，未接入本轮Android原型。

2026-09-30初始main同步的 `npm ci`、Android / iOS prebuild和质量检查属于移除Enriched之前的记录。本轮tiqian-super-mini实现、Android Debug真机查看与Enriched移除后的验证结果以 [实验03](./features/rich-content/docs/renderer-v2-experiment-03-native-flow.md) 为准；prebuild和逻辑测试通过不代表双端原生排版、选择或Release性能已验收。

## 代码结构与数据边界

| 目录 | 责任 |
| --- | --- |
| `app/` | Expo Router 页面、路由和页面级编排 |
| `api/` | Axios 客户端、X-ZSE-96 签名及知乎接口适配；响应边界使用显式类型 |
| `components/` | 跨页面 UI；业务专属渲染优先放进对应 feature |
| `features/` | 独立业务能力，目前重点是 `rich-content/` 和 `publishing/` |
| `hooks/` | 可复用交互、查询和乐观更新逻辑 |
| `storage/` | Expo SQLite、本地 Feed 缓存和曝光记录；schema 通过有序 migration 演进 |
| `store/` | Zustand 全局状态与持久化迁移 |
| `types/` | 跨 API、页面和组件复用的领域类型 |
| `utils/` | 无页面依赖的查询、URL、过滤、阅读进度、telemetry 等工具 |
| `plugins/`、`modules/` | Expo config plugins 和本地原生模块 |
| `tests/` | 不依赖完整原生运行时的回归测试 |

新增知乎接口时，优先在 `types/zhihu.ts` 或对应 `api/zhihu/*.ts` 声明响应类型，让 `apiClient` 的泛型和导出函数返回类型一起表达边界。外部 JSON 不确定时先接为 `unknown`，再通过规范化函数或类型守卫收窄。

## 持久化与敏感数据

- 登录态主存于应用沙箱的 `auth-storage.json`，用于容纳多账号 Cookie；旧版本的 SecureStore Cookie 只在首次缺少文件时用于兼容导入。主文件与当前备份使用 AES-GCM，密钥另存 SecureStore，原子读取负责 Android `.bak` 恢复；旧明文与旧 store 均保留兼容迁移，详见 [账号保存与恢复](./docs/AUTH_STORAGE.md)。
- 设置和 telemetry 开关使用 SecureStore；阅读进度迁移到最多 100 条的双快照文件，两个快照提交后才清理旧 SecureStore。推荐流缓存、曝光与创作草稿使用 Expo SQLite；缓存 24 小时过期、曝光 30 天保留并定期限量，草稿规则见 [发布编辑器](./features/publishing/README.md)。
- Cookie、`z_c0`、`d_c0`、`_xsrf`、X-ZSE 请求头、完整 Axios config、真实登录 URL 和未脱敏正文都不能进入日志、fixture、截图或测试快照。
- API 调试日志只允许记录 method、脱敏后的 path、status 和独立 request id。新增日志前检查成功、失败和异常对象分支。
- 真机正文样本先脱敏，放入 `features/rich-content/fixtures/inbox/`，确认结构后再登记到 `cases/` 和 manifest。

## 路由、缓存和原生变更

- 新增深链接时同时检查 `app/+native-intent.tsx`、`utils/url.ts` 和 `app.json` 的 intent filters，并覆盖冷启动和热启动路径。
- TanStack Query key 必须包含所有影响结果的参数；精确失效和 `utils/query.ts` 的 reset 语义要保持一致。
- 修改 SQLite schema 时递增 `storage/localDatabase.ts` 的数据库版本并新增事务 migration；不要重写已发布 migration。
- 修改 Zustand 持久结构时递增对应 store version，并实现从旧版本的迁移。
- `package.json` 和 `app.json` 的应用版本必须同步；发布 tag 使用 `v<version>`，且同一版本不能重复发布。

## GitHub Actions 与发布

- [`ci.yml`](./.github/workflows/ci.yml) 在 Pull Request 和 `main` push 时运行 `npm ci` 与 `npm run check`。
- [`build.yaml`](./.github/workflows/build.yaml) 手动构建四个 Android 单 ABI APK 和一个未签名 iOS IPA；`build_mode=build` 只保留 7 天的 artifact，`build_mode=release` 还会创建 Release。
- Release 必须从 `main` 运行，且 `package.json`、`app.json` 版本一致，`v<version>` tag 尚不存在。`publish_release=false` 创建草稿，`true` 才直接公开。
- 构建工作流的 Android job 需要 `EXPO_TOKEN` 加上 4 个 telemetry Secret，iOS job 需要其中 4 个 telemetry Secret；由于两个 job 总是一起运行，完整 workflow 需要配置 `EXPO_TOKEN`、`FIREBASE_ANDROID_JSON_B64`、`FIREBASE_IOS_PLIST_B64`、`EXPO_PUBLIC_SENTRY_DSN` 和 `SENTRY_AUTH_TOKEN`。详情见 [`docs/RELEASING.md`](./docs/RELEASING.md) 和 [`docs/TELEMETRY.md`](./docs/TELEMETRY.md)。

## 完成标准

- 实现、用户文档和配置行为一致；
- 不扩大公共边界，不把敏感数据加入日志或测试样本；
- 类型检查、相关测试、富文本分析和改动文件的 Biome 检查通过；
- 路由、缓存、持久化或原生配置变更附带迁移和对应验证；
- 最终说明中列出已运行的命令、未运行的真机/平台验证和剩余风险。
