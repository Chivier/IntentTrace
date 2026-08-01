---
status: draft
owner: performance
last_reviewed: 2026-08-01
normative: true
milestone: Gate 5
---

# 性能方法

基准环境固定 CPU/RAM/disk、Linux、Node、PostgreSQL/Redis image digest、commit 与冷/热缓存。数据集至少 10,000 raw events 和 1,500 semantic nodes，另含 2,000-event acceptance fixture。

测量 ingest events/s 与 p50/p95/p99、snapshot/query、SSE backlog catch-up、revision commit、artifact range、Graph layout 与交互帧。Provider latency/cost 单独报告，不混入 deterministic pipeline。每项预热后多次运行，保存原始 JSON 和命令。

Gate 5 才设 release budget；Gate 0 不从空壳 build 推断规模性能。回归阈值必须基于稳定基线而非单次本机结果。
