---
status: accepted
owner: api
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 2
---

# API 错误

JSON 错误采用 Problem Details 字段：`type`、`title`、HTTP `status`、稳定 `code`、`requestId`，可加不含 secret 的 `detail`/field errors。客户端按 `code` 分支，不解析 title。

保留代码：`validation_failed` 400、`unsupported_source_version` 422、`integrity_conflict` 409、`revision_conflict` 409、`cursor_expired` 410、`payload_too_large` 413、`provider_unavailable` 503。未知错误统一 `internal_error` 500；日志含内部 cause，响应不含 stack、SQL、路径或 key。

OTLP partial-success 走 OTLP response 语义而不是通用 Problem Details；整个 HTTP envelope 无法解码时才用相应 HTTP 错误。
