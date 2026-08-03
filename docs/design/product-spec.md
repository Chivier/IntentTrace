---
status: accepted
owner: product
last_reviewed: 2026-08-03
normative: true
milestone: Gate 0-Gate 5
---

# 产品规格

IntentTrace 把不可变多 Agent 执行事件转换为可回放、可验证、可重建的 Evidence-backed Intent Graph。它不替代 tracing，也不推断或展示隐藏 chain-of-thought。

核心用户任务是：从 trace 列表进入一次执行；在 Raw Inspector 与 Agent Gantt 中查看事实；用语义图理解目标、工作、问题、修复、handoff 与结果；在 Evidence Inspector 中逐条验证 claim；按 ingest/revision watermark 回放“当时已知”的状态。

首发是 Linux x86_64 单主机、本地单用户、loopback、无认证；Gate 1–5 的本地 MVP implementation 已进入仓库。macOS 通过 Tauri 壳启动同一 Docker 栈，仍需 Docker Desktop；签名/公证是独立发布证据。真实 provider adapter 已实现但默认不联网，只有显式 egress、key、model、预算和 allowlisted host 同时存在才会调用。

MVP 输入覆盖 canonical JSONL、OTLP/HTTP JSON、Codex 和 Claude session；后两者支持显式路径 import/follow。raw-only 必须在 worker、Redis 或 provider 不可用时继续浏览。正式 UI 只使用 `high|medium|low` 证据等级，不展示伪精确百分比。

非目标：公网 SaaS、auth/RBAC、多租户、OTLP gRPC、Kubernetes、图数据库、ClickHouse、Temporal、embedding、跨 run comparison、移动端。小于 1024px 只给有限只读/桌面提示；1440×900 是正式基线。
