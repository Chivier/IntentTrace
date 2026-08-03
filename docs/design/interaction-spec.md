---
status: accepted
owner: product-design
last_reviewed: 2026-08-03
normative: true
milestone: Gate 2-Gate 5
---

# 交互规格

首页清楚标注 local MVP、默认无云 egress、single-host/no-auth 边界和 historical prototype 入口。原型页带“非产品、非测试证据”警示，不执行原 HTML 中的 mock 行为。

当前桌面布局包含 trace nav、Graph、Evidence Inspector、Agent Gantt、raw table 和 replay bar。Graph、Gantt 和 Inspector 共享稳定 logical/event ID：选择 graph node 会打开 evidence，claim evidence 可定位 raw event，Gantt/raw 共用 event selection。Live/Final/stale revision 显示在图标题；pending chunk 只有确定性 SSE ghost，不显示未验证 provider 节点。

Replay 的游标是 `ingestSeq`/revision commit watermark，source time 仅用于 Gantt 坐标。断线恢复期间显示“正在补发”；cursor 过期要明确要求快照重载。键盘必须能切换视图、遍历节点、打开/关闭 Inspector；200% zoom 不遮挡主要控制；`prefers-reduced-motion` 下禁用非必要动画。

1024–1279px 把 Inspector 改为抽屉；小于 1024px 显示只读摘要和桌面提示。颜色不能是状态的唯一载体，所有图形实体需可聚焦且有可读名称。
