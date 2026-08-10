---
status: accepted
owner: architecture
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0-Gate 5
---

# 架构

本文合并了系统边界、必须始终成立的不变量，以及导入、语义和浏览三条链路的时序。总览描述组件职责，不变量是任何实现都不得违反的约束，数据流给出各链路的具体次序。

## 架构总览

系统分成事实层 ETG 和派生层 EIG。Collector 只读取操作员显式路径并把输入提交给 API；API 负责校验、分配 trace 内单调 `ingestSeq`、事务写 raw event/command/outbox；worker 以 at-least-once 方式处理 summary command；provider 只能提出 patch；deterministic reducer 校验后以 immutable revision 提交；web 通过 REST 快照和 durable SSE 展示。

PostgreSQL 是事实、revision、job 幂等和 outbox 的权威，同时是唯一的作业分发来源：不存在外部队列，worker 直接轮询 `summary_jobs`。ArtifactStore 保存 raw payload/大对象，默认 filesystem named volume，接口保留 S3 adapter。Graph 布局在 web worker 计算并尊重 pinned/稳定增量位置。

当前 API 已公开实际实现的 `/api/v1/events`、trace/raw/snapshot/graph/artifact/provider audit/human edit/delete、`POST /api/v1/imports/candidates` 与 `POST /api/v1/imports/sessions`、durable SSE 及 OTLP `POST /v1/traces`；生成 OpenAPI 是路由事实源。浏览器导入只处理操作者显式交出的字节，与 Collector 共享同一 preflight 核心与同一 trace 身份，因此两条路径互为幂等。Worker 以进程内串行 runner 按固定间隔轮询 `summary_jobs`，PostgreSQL job claim、input hash、base revision 和 commit transaction 是幂等权威。Tauri 壳不复制数据库到宿主端口，而是启动同一隔离 Compose 栈。

## 系统不变量

1. Raw event 只追加；start、end、correction、trace complete 都是新事实，禁止原地修改。
2. raw payload 只以 hash/ref 持久化；数据库 envelope 保留来源、lineage、时间、状态和 artifact refs。
3. 每个 trace 的 `ingestSeq` 由 PostgreSQL 事务单调分配；source identity + 相同 hash 幂等，不同 hash 是 `409 integrity_conflict`。
4. EIG 可删除重建；logical node/edge ID 稳定，version immutable，revision membership 复用未变化版本。
5. provider 永不写库，只能输出受 nonce、base revision、allowlist 和 schema 约束的 patch。
6. reducer 独立计算 confidence、状态、cycle、dedupe、pin 与 evidence；模型建议不是提交事实。
7. raw insert、summary command、revision commit、SSE outbox 各自在对应 PostgreSQL 事务内原子提交。
8. worker/provider 故障不破坏已入库 raw 查询；provider 失败回退 raw-only。
9. 默认无云 egress、无 home 扫描、无真实 session 自动读取、无隐藏 chain-of-thought。
10. 所有外部可达端口只绑定 loopback；该约束改变前必须增加 auth/threat-model ADR。

## 数据流与时序

导入：operator → Collector explicit path validation → adapter normalize → API transaction（identity check、`ingestSeq`、raw envelope、artifact metadata、summary command、outbox）→ REST response。重复投递先比较 canonical payload hash；相同返回原 server ID，不同返回 integrity conflict。

语义：worker 轮询 `summary_jobs` 并原子领取 command → 读取 watermark 以内 event sketch → 创建 nonce/input hash → mock 或允许的 provider 返回 patch → reducer 解析 schema/allowlist/base revision → 单事务写 immutable versions、revision membership、job result、SSE outbox → 同事务把作业置为 `committed`。重投以 input hash + base revision 返回已有结果。

浏览：web 先请求快照，再以快照 cursor 建立 SSE；按 outbox ID 应用事件。断线传 `Last-Event-ID` 或 `?cursor=`；有缺口就补发，cursor 超出 retention 返回显式错误并重新取快照。迟到 raw event 在新 ingest watermark 出现；若 final 已存在则标 stale，再产生新 final revision。
