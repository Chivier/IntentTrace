---
status: accepted
owner: database
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# Schema 不变量

`raw_events(trace_id, ingest_seq)` 与 source identity 唯一；raw 表由数据库 trigger 拒绝 UPDATE/DELETE。`traces.next_ingest_seq` 只能在 ingest transaction 内锁行递增。Artifact 在 trace 内 hash 唯一。

Revision 在 trace/branch/sequence 唯一；membership 以 revision + logical ID 为主键，且 version immutable。Revision 的内容字段不可更新；`stale` 是唯一允许的生命周期迁移，并且只能由数据库触发器接受 `false → true`。Claim ordinal 在 node version 内唯一，evidence FK 指向 raw event。Summary nonce 唯一，trace + input hash 唯一。Stream event 使用全局递增 bigint ID，trace + ID 有索引。

应用必须额外验证同一 trace 归属、hash 格式、branch parent 与 graph cycle；数据库约束是最后防线而非 reducer 替代。删除 raw/revision 相关 FK 默认 restrict，执行 trace deletion workflow 时才按明确顺序处理。
