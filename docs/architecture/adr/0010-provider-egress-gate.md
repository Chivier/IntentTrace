---
status: accepted
owner: security
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# ADR 0010：provider egress 安全门

决定：默认强制 `PROVIDER_MODE=mock`、`PROVIDER_EGRESS_ENABLED=false`。真实 provider 只有 egress、allowlisted host、key、明确 model 和正预算同时满足才启用；发送前做 redaction/event cap，返回后做本地 schema/reducer。不自动 fallback；timeout、429、预算或坏 JSON 退化 raw-only，不阻塞 ingestion。
