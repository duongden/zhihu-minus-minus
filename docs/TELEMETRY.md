# 数据统计与错误上报

本项目按 Expo 官方推荐的 React Native Firebase 路径接入 Firebase Analytics：使用 Expo Config Plugin、`expo-dev-client` 和 EAS/本地开发构建。Firebase JS SDK 可以在 Expo Go 中使用，但不支持移动端 Analytics，因此不能用于这里的 Analytics 集成。

## 本地启用

1. 在 Firebase 控制台为当前 Android application ID 和 iOS bundle identifier 注册应用。
2. 下载 `google-services.json` 和 `GoogleService-Info.plist` 到项目根目录。这两个文件只包含客户端配置，不是服务端密钥；它们已被 `.gitignore` 排除。
3. 复制 `.env.example` 为 `.env.local`，设置：

   ```text
   EXPO_PUBLIC_FIREBASE_ANALYTICS_ENABLED=true
   GOOGLE_SERVICES_JSON=./google-services.json
   GOOGLE_SERVICE_INFO_PLIST=./GoogleService-Info.plist
   ```

4. 如果启用 Sentry，设置 `EXPO_PUBLIC_SENTRY_DSN`。DSN 是运行时项目标识，不是 Sentry API 令牌。
5. 运行 `npx expo prebuild`，然后使用 `npx expo run:android`、`npx expo run:ios` 或 EAS Build。Expo Go 不包含这些原生模块。

`EXPO_PUBLIC_FIREBASE_ANALYTICS_ENABLED` 未设为 `true` 时，prebuild 会跳过 Firebase config plugins，Analytics 也会退化为空实现；因此本地无需准备两个 Firebase 配置文件即可开发、安装 CocoaPods 或生成原生项目。Firebase 原生依赖仍由 React Native 自动链接，但 iOS prebuild 会独立写入 `$RNFirebaseDisableSPM = true`，使其与项目的 static linkage 兼容，且运行时不会启用 Analytics。正式构建启用该变量后仍会使用原有插件和配置文件。未配置 Sentry DSN 时，Sentry 也不会初始化，应用仍可开发和运行。

Firebase 已公告自 2026 年 10 月起停止向 CocoaPods 发布新版本，已有版本仍可安装运行。当前项目保留已验证的 CocoaPods/static linkage 路径；后续原生依赖升级应单独评估 React Native Firebase 的 SPM 兼容性，并同时验证 Expo config plugin 和 Scene 初始化，不能只移除 `disableSPM`。依据见 [Firebase 官方迁移说明](https://firebase.google.com/docs/ios/cocoapods-deprecation)。

## 隐私开关

设置首页的「分享数据（App崩溃报告&匿名数据）」开关使用 SecureStore 持久化。关闭后：

- Firebase Analytics 调用 `setAnalyticsCollectionEnabled(false)`；
- Sentry 不再接受事件，并清理当前用户上下文；
- 已经发送到服务商的数据不会因为关闭开关而自动删除。

业务页面不应直接导入 Firebase 或 Sentry；根布局的 `Sentry.wrap` 是崩溃边界特例，事件仍统一通过适配层并遵守隐私开关。需要新增事件时，调用 `utils/telemetry.ts` 的适配方法，并只传递脱敏的事件名、类型和数值。

## 自动 JS 异常的边界

`beforeSend` 与 `beforeSendTransaction` 重新构造白名单事件。异常正文采用固定分类，保留允许的异常类型、栈帧行列、已知 bundle 文件名和 debug ID；设备/context 只保留枚举及数值，清除 user、request、extra、breadcrumbs、任意 tags、路由名、span description/data 和 hint attachments。截图、视图树、replay、profile、SDK logs、session 与 client reports 均关闭。

当前 `enableNative: false`：Sentry 原生崩溃通道绕过 JS 脱敏及实时隐私开关，因此暂不启用原生 crash/原生离线缓存。`Sentry.wrap` 和 JS 自动异常仍可采集并符号化；这会减少原生层崩溃诊断信息。要恢复原生通道，应先实现并验证等价的原生脱敏与 opt-out，不能直接打开开关。

Firebase 默认自动收集及自动页面上报关闭，collection 只在偏好 hydrate 后启用；手动事件仍须遵守前述脱敏规则。关闭开关会阻止后续事件，不能撤回已发送数据。

## CI 配置

GitHub Actions 不需要把 Firebase 文件提交到仓库。请在仓库的 `Settings → Secrets and variables → Actions` 中创建以下 Secrets：

- `EXPO_TOKEN`：Expo Access Token，Android 本地 EAS Build 使用；
- `FIREBASE_ANDROID_JSON_B64`：`google-services.json` 的 base64 内容；
- `FIREBASE_IOS_PLIST_B64`：`GoogleService-Info.plist` 的 base64 内容；
- `EXPO_PUBLIC_SENTRY_DSN`：Sentry DSN；
- `SENTRY_AUTH_TOKEN`：Sentry Organization Auth Token，用于构建时上传 source map。

Android job 通过 Expo GitHub Action 使用 `EXPO_TOKEN`，并校验另外 4 个 telemetry Secret；iOS job 只校验这 4 个 telemetry Secret。由于当前 workflow 总是同时运行 Android 和 iOS，完整构建（包括只选择 artifact、不创建 GitHub Release 的模式）仍需要配置全部 5 个 Secret。

本项目的 Sentry 组织位于 DE 区域，配置中的 Sentry URL 已固定为 `https://de.sentry.io/`。

macOS 可以这样生成 base64 内容，再粘贴到对应 Secret：

```bash
base64 < google-services.json | tr -d '\n'
base64 < GoogleService-Info.plist | tr -d '\n'
```

`build.yaml` 会在每个构建 job 中把这两个 Firebase Secret 临时还原为根目录文件，并通过环境变量交给 `app.config.ts`。`.easignore` 会在 EAS 创建临时构建归档时将这两个刚生成的文件包含进去；它们仍被 `.gitignore` 忽略，不会进入 Git。runner 结束后文件随工作区一起销毁。Firebase 客户端文件本身不是服务端私钥，但仍按环境配置管理，不提交到 Git。`SENTRY_AUTH_TOKEN` 只放在 CI/EAS Secret 中，绝不能放进 App 包或提交到仓库。

## 移除方式

仅移除 Firebase Analytics 时，删除适配层中的 Firebase 分支、`package.json` 的两个 `@react-native-firebase/*` 依赖、Firebase config plugins、`firebase.json` 和 `app.config.ts` 的 Firebase 配置；同步删去工作流中的 Firebase 文件还原、校验与环境变量，以及 `.easignore` 的配置文件例外。保留 Sentry 分支和隐私开关。

完全移除 telemetry 时，还需删除 `@sentry/react-native` 依赖及 config plugin、根布局的 Sentry 导入和 `Sentry.wrap`、telemetry 初始化与业务调用、`utils/telemetry.ts`、`store/useTelemetryStore.ts` 及设置页开关。同步清理构建工作流和本地脚本中的 Sentry 上传配置、`.env.example` 与 `app.config.ts` 的 DSN 配置，以及对应 CI Secrets。根布局改为导出未包装的布局组件；业务页面不直接依赖厂商 SDK。

任一原生 SDK 移除后都要同步锁文件、重新 prebuild、安装 Pods 并重新编译两端，不能只依靠 Fast Refresh 验证。
