---
status: accepted
owner: architecture
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# 架构总览

系统分成事实层 ETG 和派生层 EIG。Collector 只读取操作员显式路径并把输入提交给 API；API 负责校验、分配 trace 内单调 `ingestSeq`、事务写 raw event/command/outbox；worker 以 at-least-once 方式处理 summary command；provider 只能提出 patch；deterministic reducer 校验后以 immutable revision 提交；web 通过 REST 快照和 durable SSE 展示。

PostgreSQL 是事实、revision、job 幂等和 outbox 的权威。Redis/BullMQ 只做投递，不是正确性源。ArtifactStore 保存 raw payload/大对象，默认 filesystem named volume，接口保留 S3 adapter。Graph 布局在 web worker 计算并尊重 pinned/稳定增量位置。

Gate 0 的 API 仅有 `/healthz`、`/readyz`、`/version` 和对应 OpenAPI；worker 不消费任务，Collector 不读取内容，web 只是状态页。计划中的 `/api/v1`、`/v1/traces` 和 SSE 不得提前暴露假实现。
