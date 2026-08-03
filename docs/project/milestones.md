---
status: accepted
owner: program
last_reviewed: 2026-08-03
normative: true
milestone: Gate 0-Gate 5
---

# Milestone 定义

一个 milestone 完成必须同时满足：范围内代码和文档已提交；contract/fixture 存在；所有强制 automated checks 通过；需要外部服务/硬件的 environment checks 有明确环境证据；`progress.md` 无把 planned 写成 implemented；`release-readiness.md` 对该 Gate 无 blocker。

Gate 0–3 的 local/mock implementation 已闭合；Gate 4 adapter code 与安全测试已闭合，但真实 provider 环境证据必须有用户显式凭据；Gate 5 local hardening 已闭合但稳定性能 SLA 仍只有 synthetic smoke。因而当前称为 local MVP candidate，不称为已签名 macOS release 或真实-provider-qualified release。

跨 Gate 的工作可先以 `authored_unexecuted` 落盘，但不得提前启用网络、读取真实 session 或扩大 loopback 边界。
