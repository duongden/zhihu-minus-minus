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
cd ios && pod install
cd ..
npx expo run:ios --configuration Debug --device
```

需要真机 Release 验证时，在 Xcode 打开生成的 `ios/*.xcworkspace`，选择自己的 Team 后构建。Release IPA 是未签名的，不能替代签名流程。

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

它依次执行类型检查、只读 Biome 检查、全部 Jest 测试和富文本 fixture 分析。测试运行在 `jest-expo` preset 下；逻辑测试使用 `.test.ts`，React Native 组件测试使用 `.test.tsx`，交互断言使用 React Native Testing Library。常用命令如下：

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

`npm run lint` 不修改文件；需要自动修复时使用 `npm run lint:fix` 或 `npm run format`，然后逐项检查 diff。富文本专项的 fixture 投递、脱敏和 manifest 规则见 [`features/rich-content/README.md`](./features/rich-content/README.md)。

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

- 登录态主存于应用沙箱的 `auth-storage.json`，用于容纳多账号 Cookie；旧版本的 SecureStore Cookie 只在首次缺少文件时用于兼容导入。该文件目前没有静态加密，改动存储格式时必须保留迁移和旧账号读取能力。
- 设置、阅读进度和 telemetry 开关使用 SecureStore；推荐流缓存与近期曝光记录使用 Expo SQLite，并按账号隔离、定期淘汰。
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
