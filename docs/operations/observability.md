---
status: draft
owner: operations
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# 可观测性

Gate 0 提供 API `/healthz`（进程）、`/readyz`（PostgreSQL/Redis）和 `/version`（build/schema），web 提供 `/healthz` 与状态页。日志为结构化 server log，redact authorization/cookie；worker 启动日志明确“不消费 job”。

后续指标：ingest count/error/conflict、trace watermark lag、queue age/attempt/DLQ、revision commit/reject reason、SSE backlog/gap、artifact bytes、provider latency/token/cost/redaction。Label 不包含 raw text、user path、event ID 高基数或 key。

告警应指向 runbook，并区分 liveness、dependency readiness 与产品降级。Provider outage 不是 raw browsing outage；Redis 故障不应把 PostgreSQL 已入库 trace 标丢失。
