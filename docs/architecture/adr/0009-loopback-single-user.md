---
status: accepted
owner: security
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# ADR 0009：本地单用户与 loopback

决定：首发无 auth/RBAC/tenant，所有宿主端口只绑定 `127.0.0.1`。这是部署边界，不等于输入可信：仍需 XSS、路径、prompt injection 和 secret redaction 防护。任何公网或 LAN 暴露都必须先新增认证、CSRF/CORS、租户隔离和威胁模型。
