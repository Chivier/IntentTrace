---
status: accepted
owner: ingestion
last_reviewed: 2026-08-01
normative: true
milestone: Gate 1
---

# Event 排序与幂等

Source time 可缺失、重复或回退，只用于展示。规范处理顺序是 trace 内服务器分配的 `ingestSeq`，分配与 raw insert 在同一事务，不能由 Redis 或进程内计数器承担。

幂等 identity 为 source kind + source session ID + source event ID。Canonical normalization 后计算 payload SHA-256：首次写入分配 server ID/sequence；重复 identity + 相同 hash 返回原记录并标 `duplicate`; 重复 identity + 不同 hash 返回 HTTP 409、code `integrity_conflict`，两份内容都不被覆盖。

start/end/correction/complete/late 都是追加 event。乱序可接受；malformed ID 在 adapter 边界 fail-visible，只有规范明确允许的修复才可产生新 normalized 字段，并保留原 payload ref。
