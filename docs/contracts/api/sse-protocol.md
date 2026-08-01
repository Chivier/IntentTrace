---
status: draft
owner: api
last_reviewed: 2026-08-01
normative: true
milestone: Gate 2
---

# SSE 协议

每个 frame 包含持久十进制 outbox `id`、版本化 `event` 名称和 JSON data。连接先用 REST snapshot 获得 cursor，再以 `Last-Event-ID` 或 `?cursor=` 恢复；两者同时提供且不一致时拒绝请求。

事件族计划为 `raw_event.appended`、`trace.completed`、`semantic_chunk.pending`、`revision.committed`、`revision.stale`。`semantic_chunk.pending` 只含确定性 chunk/job metadata；未验证模型节点绝不通过流暴露。客户端按 ID 单调去重，检测 gap 后停止应用并补发。

Outbox retention 后的旧 cursor 返回 `410 cursor_expired`，客户端清空临时状态并取新快照。Heartbeat comment 不占 outbox ID。SSE payload 只含 ref/摘要，不内联大 artifact。
