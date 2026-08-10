---
status: current
owner: performance
last_reviewed: 2026-08-10
normative: true
milestone: Gate 5
---

# 性能方法

基准环境固定 CPU/RAM/disk、Linux、Node、PostgreSQL image digest、commit 与冷/热缓存。数据集至少 10,000 raw events 和 1,500 semantic nodes，另含 2,000-event acceptance fixture。

测量 ingest events/s 与 p50/p95/p99、snapshot/query、SSE backlog catch-up、revision commit、artifact range、Graph layout 与交互帧。Provider latency/cost 单独报告，不混入 deterministic pipeline。每项预热后多次运行，保存原始 JSON 和命令。

`pnpm performance:smoke` 是固定 10,000 raw / 1,500 node 的内存生成与 reducer correctness smoke，输出明确标为 `synthetic_smoke_not_ui_sla`。2026-08-03 本机单次约 10.14ms/4.03ms，只证明算法没有明显数量级回归。DB ingest/query、ELK 1,500-node 和浏览器帧率尚无稳定多轮原始数据，因此发布声明不得写成完成性能 SLA。
