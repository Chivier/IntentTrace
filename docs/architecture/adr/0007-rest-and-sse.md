---
status: accepted
owner: architecture
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# ADR 0007：REST 快照与 durable SSE

决定：MVP 用 `/api/v1` REST 读写和 SSE 增量，不引入 WebSocket。OTLP 保留标准 `POST /v1/traces`。SSE ID 来自持久 outbox，支持 `Last-Event-ID` 和 `?cursor=`；过期 cursor fail-visible。Gate 0 OpenAPI 只列真实 health/readiness/version。
