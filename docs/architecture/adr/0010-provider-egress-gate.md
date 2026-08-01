---
status: accepted
owner: security
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# ADR 0010：provider egress 安全门

决定：默认且 Gate 0 强制 `PROVIDER_MODE=mock`、`PROVIDER_EGRESS_ENABLED=false`。只有 redaction、egress audit、预算、prompt-injection/XSS 测试通过后才能显式配置真实 provider；不自动 fallback 到另一 provider。timeout、429、预算或坏 JSON 退化 raw-only，不阻塞 ingestion。
