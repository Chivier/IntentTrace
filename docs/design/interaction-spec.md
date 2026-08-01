---
status: draft
owner: product-design
last_reviewed: 2026-08-01
normative: true
milestone: Gate 2-Gate 5
---

# 交互规格

Gate 0 首页必须清楚标注状态、已实现能力、未实现能力、API readiness 和 historical prototype 入口。原型页必须带“非产品、非测试证据”警示，不执行原 HTML 中的 mock 行为。

后续桌面布局为左侧 trace/nav、中部 Graph 或 Gantt、右侧 Evidence Inspector、底部 replay。Graph、Gantt 和 Inspector 共享稳定 logical ID：任一视图选择节点、event、agent 或 artifact 后，其他视图只做定位和高亮，不复制实体。Live/Final 明确分离；pending chunk 显示确定性 ghost，不显示未验证 provider 节点。

Replay 的游标是 `ingestSeq`/revision commit watermark，source time 仅用于 Gantt 坐标。断线恢复期间显示“正在补发”；cursor 过期要明确要求快照重载。键盘必须能切换视图、遍历节点、打开/关闭 Inspector；200% zoom 不遮挡主要控制；`prefers-reduced-motion` 下禁用非必要动画。

1024–1279px 把 Inspector 改为抽屉；小于 1024px 显示只读摘要和桌面提示。颜色不能是状态的唯一载体，所有图形实体需可聚焦且有可读名称。
