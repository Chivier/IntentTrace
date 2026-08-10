---
status: accepted
owner: architecture
last_reviewed: 2026-08-10
normative: true
milestone: Gate 1-Gate 4
---

# 数据流与时序

导入：operator → Collector explicit path validation → adapter normalize → API transaction（identity check、`ingestSeq`、raw envelope、artifact metadata、summary command、outbox）→ REST response。重复投递先比较 canonical payload hash；相同返回原 server ID，不同返回 integrity conflict。

语义：worker 轮询 `summary_jobs` 并原子领取 command → 读取 watermark 以内 event sketch → 创建 nonce/input hash → mock 或允许的 provider 返回 patch → reducer 解析 schema/allowlist/base revision → 单事务写 immutable versions、revision membership、job result、SSE outbox → 同事务把作业置为 `committed`。重投以 input hash + base revision 返回已有结果。

浏览：web 先请求快照，再以快照 cursor 建立 SSE；按 outbox ID 应用事件。断线传 `Last-Event-ID` 或 `?cursor=`；有缺口就补发，cursor 超出 retention 返回显式错误并重新取快照。迟到 raw event 在新 ingest watermark 出现；若 final 已存在则标 stale，再产生新 final revision。
