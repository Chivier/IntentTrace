---
status: accepted
owner: data-contracts
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# Revision 模型

Revision 是不可变图快照引用集，不复制未变化实体。字段至少含 revision ID、trace ID、parent revision ID、branch kind、event watermark、status、stale reason、created at/source job。Node/edge membership 指向 immutable version；logical ID 在版本间稳定。

`live` revision 可随已验证 chunk 增长；`final` 只在 complete marker 与 reconciliation 后生成；`human` 从选定 parent 分支并保存 pin/edit。迟到 event 高于 final watermark 时，旧 final 保留但标 stale，后续生成新 final。并发 reducer 必须以 `baseRevisionId` compare-and-commit；过期 base 返回冲突并重新排队，不能自动覆写。

Replay 查询必须同时给定 trace 与 watermark/revision，不能以当前 membership 回填历史时刻。
