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

## 隐私开关

设置首页的「分享数据（App崩溃报告&匿名数据）」开关使用 SecureStore 持久化。关闭后：

- Firebase Analytics 调用 `setAnalyticsCollectionEnabled(false)`；
- Sentry 不再接受事件，并清理当前用户上下文；
- 已经发送到服务商的数据不会因为关闭开关而自动删除。

产品代码不应直接导入 Firebase 或 Sentry。需要新增事件时，调用 `utils/telemetry.ts` 的适配方法，并只传递脱敏的事件名、类型和数值。

## CI 配置

GitHub Actions 不需要把 Firebase 文件提交到仓库。请在仓库的 `Settings → Secrets and variables → Actions` 中创建以下 Secrets：

- `FIREBASE_ANDROID_JSON_B64`：`google-services.json` 的 base64 内容；
- `FIREBASE_IOS_PLIST_B64`：`GoogleService-Info.plist` 的 base64 内容；
- `EXPO_PUBLIC_SENTRY_DSN`：Sentry DSN；
- `SENTRY_AUTH_TOKEN`：Sentry Organization Auth Token，用于构建时上传 source map。

本项目的 Sentry 组织位于 DE 区域，配置中的 Sentry URL 已固定为 `https://de.sentry.io/`。

macOS 可以这样生成 base64 内容，再粘贴到对应 Secret：

```bash
base64 < google-services.json | tr -d '\n'
base64 < GoogleService-Info.plist | tr -d '\n'
```

`build.yaml` 会在每个构建 job 中把这两个 Firebase Secret 临时还原为根目录文件，并通过环境变量交给 `app.config.ts`。`.easignore` 会在 EAS 创建临时构建归档时将这两个刚生成的文件包含进去；它们仍被 `.gitignore` 忽略，不会进入 Git。runner 结束后文件随工作区一起销毁。Firebase 客户端文件本身不是服务端私钥，但仍按环境配置管理，不提交到 Git。`SENTRY_AUTH_TOKEN` 只放在 CI/EAS Secret 中，绝不能放进 App 包或提交到仓库。

## 移除方式

集成被限制在 `utils/telemetry.ts`、`store/useTelemetryStore.ts`、设置首页的分享数据开关、Expo 配置和两个 Firebase 依赖中。移除这些代码、对应 config plugins、`firebase.json` 以及 `package.json` 中的两个 `@react-native-firebase/*` 依赖后，再从根布局删除 telemetry 初始化和设置页入口即可；业务页面不依赖厂商 SDK。
