---
status: accepted
owner: architecture
last_reviewed: 2026-08-09
normative: true
milestone: Gate 0-Gate 5
---

# 架构总览

系统分成事实层 ETG 和派生层 EIG。Collector 只读取操作员显式路径并把输入提交给 API；API 负责校验、分配 trace 内单调 `ingestSeq`、事务写 raw event/command/outbox；worker 以 at-least-once 方式处理 summary command；provider 只能提出 patch；deterministic reducer 校验后以 immutable revision 提交；web 通过 REST 快照和 durable SSE 展示。

PostgreSQL 是事实、revision、job 幂等和 outbox 的权威。Redis/BullMQ 只做投递，不是正确性源。ArtifactStore 保存 raw payload/大对象，默认 filesystem named volume，接口保留 S3 adapter。Graph 布局在 web worker 计算并尊重 pinned/稳定增量位置。

当前 API 已公开实际实现的 `/api/v1/events`、trace/raw/snapshot/graph/artifact/provider audit/human edit/delete、`POST /api/v1/imports/candidates` 与 `POST /api/v1/imports/sessions`、durable SSE 及 OTLP `POST /v1/traces`；生成 OpenAPI 是路由事实源。浏览器导入只处理操作者显式交出的字节，与 Collector 共享同一 preflight 核心与同一 trace 身份，因此两条路径互为幂等。Worker 消费 BullMQ 任务，但 PostgreSQL job claim、input hash、base revision 和 commit transaction 才是幂等权威。Tauri 壳不复制数据库到宿主端口，而是启动同一隔离 Compose 栈。
