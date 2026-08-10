---
status: accepted
owner: operations
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0-Gate 5
---

# 可观测性

API 提供 `/healthz`（进程）、`/readyz`、`/version` 和最小 Prometheus `/metrics`；web 提供 `/healthz` 与 readiness proxy。`/readyz` 的 `dependencies` 只有 `postgres` 一项，这是生成 OpenAPI 里的已发布响应契约，不含任何占位依赖。日志是结构化 server log并 redacts authorization/cookie。Worker 日志声明轮询间隔与 provider；provider-call audit 保存 model/hash/usage/cost，不保存正文。

当前 outbox/job/provider tables 可诊断 watermark、attempt、失败码、SSE backlog 和 token/cost。更细的 ingest/latency histogram 仍是 post-MVP observability enhancement；label 禁止 raw text、user path、event ID 高基数或 key。

告警应指向 runbook，并区分 liveness、dependency readiness 与产品降级。Provider outage 不是 raw browsing outage；worker 或 provider 故障不应把 PostgreSQL 已入库 trace 标丢失。
