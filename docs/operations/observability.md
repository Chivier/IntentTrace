---
status: accepted
owner: operations
last_reviewed: 2026-08-03
normative: true
milestone: Gate 0-Gate 5
---

# 可观测性

API 提供 `/healthz`（进程）、`/readyz`（PostgreSQL/Redis）、`/version` 和最小 Prometheus `/metrics`；web 提供 `/healthz` 与 readiness proxy。日志是结构化 server log并 redacts authorization/cookie。Worker 日志声明 queue/provider；provider-call audit 保存 model/hash/usage/cost，不保存正文。

当前 outbox/job/provider tables 可诊断 watermark、attempt、失败码、SSE backlog 和 token/cost。更细的 ingest/latency histogram 仍是 post-MVP observability enhancement；label 禁止 raw text、user path、event ID 高基数或 key。

告警应指向 runbook，并区分 liveness、dependency readiness 与产品降级。Provider outage 不是 raw browsing outage；Redis 故障不应把 PostgreSQL 已入库 trace 标丢失。
