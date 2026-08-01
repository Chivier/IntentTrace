---
status: accepted
owner: architecture
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# ADR 0006：PostgreSQL 幂等与 outbox

决定：BullMQ 按 at-least-once 使用，正确性由 PostgreSQL input hash、base revision 与唯一约束保证。raw insert/command、revision/job result、SSE event 分别与其业务写入同事务。Redis 丢失可以重建投递；数据库提交前不得 ack。
