# Rich content rendering

这个目录集中维护知乎富文本渲染的设计记录、真实内容样本、分析工具和回归测试。应用组件仍保留在现有的 `components/`、`app/` 目录中，直到 Block AST 方案经过真机基准验证，不提前做大规模搬迁。

对应 GitHub Issue：[#40](https://github.com/huamurui/zhihu-minus-minus/issues/40)

## 目录

- `docs/`：架构决策、真机基准计划和阶段性结论。
- `fixtures/`：真实内容样本的 manifest、存放规范和期望特征。
- `tests/`：不依赖 React Native 运行时的 fixture 回归测试。
- `tools/`：内容复杂度分析和后续基准辅助工具。

## 常用命令

```bash
npm run analyze:rich-content
npm run test:rich-content
```

分析命令会读取 `fixtures/manifest.json`，输出每个案例的段落、图片、公式、标题、视频卡片等结构统计，并校验 manifest 中已确认的特征。

## 当前范围

1. 建立可重复的真实内容测试集和真机性能基线。
2. 修复折叠卡片挂载完整正文、RNRH 配置不稳定等确定性问题。
3. 评估单个离线 DOM/WebView 详情渲染器。
4. 最后用数据决定是否推进 `ZhihuBlock` + FlashList。

在 Phase 0 完成前，这个目录不会把桌面 Node 微基准描述成手机端最终性能。
