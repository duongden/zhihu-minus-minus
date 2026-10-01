# 设计 Token

应用层的视觉值统一维护在 [`constants/designTokens.json`](../constants/designTokens.json) 中。它是 TypeScript、React Native 和 NativeWind 共用的源文件，避免在 `Colors.ts`、`tailwind.config.js` 和页面之间重复抄写同一组颜色。

## 分层

- `colors.light` / `colors.dark`：默认主题的完整颜色，两个模式使用相同的 token 键。优先使用 `text`、`backgroundSecondary`、`border`、`iconMuted` 等语义 token，不要直接使用 hex 值。
- `themeAdjustments.readingBackground`：`soft`、`warm`、`dim` 各自完整的 light/dark 颜色。每套显式定义全部颜色 token，文字、边框、控件、遮罩、徽标和聊天气泡等均与背景配套；品牌、状态、热榜和图片操作色保留原有语义。`default` 在解析器中直接引用 `colors`，避免重复维护。
- `themeAdjustments.textContrast`：文字对比度覆盖；`standard` 为空，保留当前预设的文字色，`high` 只覆盖正文、次要和弱化文字。
- `typography`：系统字体、常用字号、行高比例和字重。
- `radii` / `opacity`：通用圆角和交互透明度。
- `effects`：渐变遮罩和模糊层等跨组件效果。

## 使用方式

React Native 的运行时颜色使用 `useThemeColor`，字号等静态值使用 `@/constants/designTokens`：

```ts
import { useThemeColor } from '@/components/Themed';
import { typography } from '@/constants/designTokens';

// 在组件或 hook 顶层调用。
const color = useThemeColor({}, 'textSecondary');
const titleStyle = { color, fontSize: typography.fontSize.title };
```

NativeWind 的语义 class 通过根布局 `vars` 读取同一套运行时 palette，例如 `bg-surface`、`text-foreground`、`text-tertiary`、`border-border` 和 `bg-primary`。`constants/Colors.ts` 仅作为旧代码的兼容入口，新代码不要再从那里新增依赖。

运行时由 `resolveThemeColors` 按“完整阅读预设 → 文字对比度 → 表面层次 → 自定义主色”的顺序解析，随后修正文字/链接对比度并生成 `onPrimary`，供 `useRuntimeThemeColors`、`useThemeColor`、React Navigation 和三个正文后端使用。预设通过 `ColorToken` 的完整映射进行类型检查，新增基础颜色时必须同步补齐所有预设。解析器会复制预设，用户覆盖不会改写 token 源数据。知乎接口返回的标签色等内容数据可以保留在 feature 边界内，不应反向写入全局设计 token。

NativeWind 的 `bg-primary` 保留自定义主色；`text-link` 使用满足阅读背景对比度的派生主色，主色纯色按钮使用 `text-on-primary`。旧 `Colors` 入口解析并缓存同一 runtime palette，`useColorScheme` 订阅颜色偏好以兼容旧组件；直接读取基础 `colors` 或在模块级 StyleSheet 中保存运行时值仍不会自动更新。新代码使用运行时 hook。

主题模式由 `store/useThemeStore.ts` 管理，支持 `system`、`light` 和 `dark`。`system` 模式会监听操作系统外观变化，手动切换后的模式会持久化。涉及主色的原生组件样式使用运行时 hook 或语义 class，不把运行时值提前固定在模块级常量中。

主题同步入口在原生端通过 `TurboModuleRegistry` 调用 `Appearance` 模块，传入 `light`、`dark` 或 `unspecified`，再将实际外观事件同步给 React Native 与 NativeWind；Web 端使用 NativeWind 的公开主题 API。这条原生兼容路径最初用于规避旧版本运行时的 `null` 参数和系统颜色缓存问题。当前锁定的 CSS interop 已对 RN 0.82+ 使用 `unspecified`，RN 0.83.10 的 JS setter 也会读取实际系统颜色，不应再把旧缺陷当作当前版本事实。后续若简化兼容路径，须先保留并通过下面的主题回归测试。

修改主题同步或升级相关依赖后运行 `npm test -- tests/themeMode.test.js tests/runtimeTheme.test.tsx --runInBand`。测试加载未修改的 Appearance 和 NativeWind 原生运行时代码，模拟 Android 的非空参数约束和异步外观事件，覆盖冷启动、手动模式、恢复跟随系统和回到前台。

文字与背景的用户调整方案见 [`docs/THEME_CUSTOMIZATION.md`](./THEME_CUSTOMIZATION.md)，其中区分了主题预设、低门槛调节和高级自定义三层能力。
