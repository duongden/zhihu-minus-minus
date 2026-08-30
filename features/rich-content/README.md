# Rich content rendering

这个目录集中维护知乎富文本渲染的运行时代码、设计记录、真实内容样本、分析工具和回归测试。业务页面只从本模块的 `index.ts` 导入渲染能力，避免实现、样本和验证逻辑散落在仓库各处。

对应 GitHub Issue：[#40](https://github.com/huamurui/zhihu-minus-minus/issues/40)

## 目录

- `components/`：原生 RNRH 渲染器和 WebView/DOM 备用渲染器。
- `docs/`：架构决策、真机基准计划和阶段性结论。
- `fixtures/inbox/`：可以持续投递的新 `.md`/HTML 样本。
- `fixtures/cases/`：已经登记精确期望值的稳定回归案例。
- `fixtures/manifest.json`：稳定案例的来源、特征和结构断言。
- `tests/`：不依赖 React Native 运行时的 fixture 回归测试。
- `tools/`：内容复杂度分析和后续基准辅助工具。
- `index.ts`：供应用层使用的稳定公共入口。

`components/ZhihuContent.tsx` 和 `components/ZhihuDOMContent.tsx` 仅保留兼容转发，不再包含实现。新代码统一使用：

```ts
import { ZhihuContent } from '@/features/rich-content';
```

## 常用命令

```bash
npm run analyze:rich-content
npm run analyze:rich-content:inbox
npm run test:rich-content
```

第一个分析命令校验 manifest 中的稳定案例；带 `inbox` 的命令递归扫描新投递文件，只输出结构统计，不要求先维护 manifest。

## 当前范围

1. 建立可重复的真实内容测试集和真机性能基线。
2. 修复折叠卡片挂载完整正文、RNRH 配置不稳定等确定性问题。
3. 评估单个离线 DOM/WebView 详情渲染器。
4. 最后用数据决定是否推进 `ZhihuBlock` + FlashList。

在 Phase 0 完成前，这个模块不会把桌面 Node 微基准描述成手机端最终性能。
