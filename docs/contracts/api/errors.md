---
status: accepted
owner: api
last_reviewed: 2026-08-09
normative: true
milestone: Gate 0-Gate 2
---

# API 错误

JSON 错误采用 Problem Details 字段：`type`、`title`、HTTP `status`、稳定 `code`、`requestId`，可加不含 secret 的 `detail`/field errors。客户端按 `code` 分支，不解析 title。

保留代码：`validation_failed` 400、`unsupported_source_version` 422、`unknown_source_format` 422、`no_visible_events` 422、`preflight_failed` 422、`integrity_conflict` 409、`revision_conflict` 409、`cursor_expired` 410、`payload_too_large` 413、`unsupported_media_type` 415、`provider_unavailable` 503。未知错误统一 `internal_error` 500；日志含内部 cause，响应不含 stack、SQL、路径或 key。

`payload_too_large` 413 与 `unsupported_media_type` 415 由 `POST /api/v1/imports/sessions` 实际发出：Fastify 的 `FST_ERR_CTP_BODY_TOO_LARGE` 与 `FST_ERR_CTP_INVALID_MEDIA_TYPE` 在 error handler 中显式映射，不再落入 `internal_error`。上传体超过 `IMPORT_UPLOAD_MAX_BYTES` 时得到 413；缺少 `content-type: application/octet-stream` 时得到 415。`unknown_source_format` 表示四个 adapter 都不认识这些字节，且没有任何事件被写入。

OTLP partial-success 走 OTLP response 语义而不是通用 Problem Details；整个 HTTP envelope 无法解码时才用相应 HTTP 错误。
