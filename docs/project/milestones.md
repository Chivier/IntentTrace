---
status: accepted
owner: program
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# Milestone 定义

一个 milestone 完成必须同时满足：范围内代码和文档已提交；contract/fixture 存在；所有强制 automated checks 通过；需要外部服务/硬件的 environment checks 有明确环境证据；`progress.md` 无把 planned 写成 implemented；`release-readiness.md` 对该 Gate 无 blocker。

Gate 0 不含完整 Trace Viewer、真实 ingest/summary/provider。Gate 1 不含 semantic graph。Gate 2 不含模型语义。Gate 3 只证明 mock pipeline。Gate 4 才能证明选定 provider adapter。Gate 5 才能声明 MVP release candidate。

跨 Gate 的工作可先以 `authored_unexecuted` 落盘，但不得提前启用网络、读取真实 session 或扩大 loopback 边界。
