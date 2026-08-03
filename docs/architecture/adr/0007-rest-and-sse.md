---
status: accepted
owner: architecture
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# ADR 0007：REST 快照与 durable SSE

决定：MVP 用 `/api/v1` REST 读写和 SSE 增量，不引入 WebSocket。OTLP 保留标准 `POST /v1/traces`。SSE ID 来自持久 outbox，支持 `Last-Event-ID` 和 `?cursor=`；早于保留窗口的 cursor 先发 `resync.required` 再补最早可用事件。生成 OpenAPI只列真实 route。
