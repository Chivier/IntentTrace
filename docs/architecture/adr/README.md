---
status: current
owner: architecture
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0
---

# ADR 索引

Accepted：[`0001`](0001-dual-graph.md) 双图、[`0002`](0002-contract-source-of-truth.md) 契约事实源、[`0003`](0003-revisions-and-watermarks.md) revision、[`0004`](0004-deterministic-reducer.md) reducer、[`0005`](0005-artifact-store.md) artifact、[`0006`](0006-transactional-outbox.md) outbox、[`0007`](0007-rest-and-sse.md) REST/SSE、[`0008`](0008-typescript-monorepo.md) monorepo、[`0009`](0009-loopback-single-user.md) loopback、[`0010`](0010-provider-egress-gate.md) provider gate、[`0012`](0012-guided-session-import.md) 两阶段 guided import、[`0013`](0013-browser-session-upload.md) 浏览器交付的会话上传、[`0014`](0014-postgres-only-job-dispatch.md) PostgreSQL 单源作业调度。ADR 0011 的权限边界由 0012 保留，其旧的一层文件实现限制已 superseded。ADR 0014 只 supersede 0006、0008、0009 中与队列传输相关的条款；0006 的 PostgreSQL 幂等/outbox 结论与 0009 的 loopback 边界继续成立。

ADR 一旦 Accepted 不改写结论；替代时新建 ADR 并标记 superseded。Draft 接口不进入实际 OpenAPI。
