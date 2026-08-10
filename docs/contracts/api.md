---
status: accepted
owner: api
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0-Gate 5
---

# API 契约

本文覆盖 REST/OTLP 路由约定、Problem Details 错误码与 durable SSE 协议。实际存在的路由永远以生成的 [`api/openapi.yaml`](api/openapi.yaml) 为准，本文只描述生成物无法表达的规则。

## API 设计

实际路由以生成的 [`openapi.yaml`](api/openapi.yaml) 为准。除 health/readiness/version/metrics 外，已实现 event ingest、trace list/detail/delete、raw pagination、snapshot、graph revision、revision list（`GET /api/v1/traces/{traceId}/revisions`，按创建时间倒序，供 Live/Final 切换定位 revision）、human node edit、provider-call audit、artifact range、SSE、浏览器会话导入（`POST /api/v1/imports/candidates` 与 `POST /api/v1/imports/sessions`）以及标准 OTLP JSON receiver。`/documentation` 是本地 OpenAPI UI，不算业务 API。

业务 REST 统一 `/api/v1`；OTLP receiver 独立使用 `POST /v1/traces` 并返回 partial success。Source identity collision 返回 `409 integrity_conflict`；删除要求 `confirm` 精确等于 trace ID；human edit 必须携带 current `baseRevisionId`。分页和 SSE 使用单调 cursor，不能用 source time 代表“当时已知”。

API 只访问数据库/ArtifactStore，不读取任意宿主机路径。`imports/*` 两条路由只解析请求体里已经到达的字节，不接受路径参数、不枚举目录；`imports/candidates` 检查每个候选的 bounded head 并只发一次批量 trace 查询，`imports/sessions` 以 `application/octet-stream` 接收整份 session 并复用与 collector 相同的完整 preflight 和内容哈希 `trace_complete` 标记。未实现的 project 管理、auth、gRPC 和 provider registry mutation 仍只留在设计文档，不得手改生成 OpenAPI。

## API 错误

JSON 错误采用 Problem Details 字段：`type`、`title`、HTTP `status`、稳定 `code`、`requestId`，可加不含 secret 的 `detail`/field errors。客户端按 `code` 分支，不解析 title。

保留代码：`validation_failed` 400、`unsupported_source_version` 422、`unknown_source_format` 422、`no_visible_events` 422、`preflight_failed` 422、`integrity_conflict` 409、`revision_conflict` 409、`cursor_expired` 410、`payload_too_large` 413、`unsupported_media_type` 415、`provider_unavailable` 503。未知错误统一 `internal_error` 500；日志含内部 cause，响应不含 stack、SQL、路径或 key。

`payload_too_large` 413 与 `unsupported_media_type` 415 由 `POST /api/v1/imports/sessions` 实际发出：Fastify 的 `FST_ERR_CTP_BODY_TOO_LARGE` 与 `FST_ERR_CTP_INVALID_MEDIA_TYPE` 在 error handler 中显式映射，不再落入 `internal_error`。上传体超过 `IMPORT_UPLOAD_MAX_BYTES` 时得到 413；缺少 `content-type: application/octet-stream` 时得到 415。`unknown_source_format` 表示四个 adapter 都不认识这些字节，且没有任何事件被写入。

OTLP partial-success 走 OTLP response 语义而不是通用 Problem Details；整个 HTTP envelope 无法解码时才用相应 HTTP 错误。

## SSE 协议

_来源文档状态为 `draft`：事件族与字段仍可能变化，尚未 accepted。_

每个 frame 包含持久十进制 outbox `id`、版本化 `event` 名称和 JSON data。连接先用 REST snapshot 获得 cursor，再以 `Last-Event-ID` 或 `?cursor=` 恢复；两者同时提供且不一致时拒绝请求。

事件族计划为 `raw_event.appended`、`trace.completed`、`semantic_chunk.pending`、`revision.committed`、`revision.stale`。`semantic_chunk.pending` 只含确定性 chunk/job metadata；未验证模型节点绝不通过流暴露。客户端按 ID 单调去重，检测 gap 后停止应用并补发。

Outbox retention 后的旧 cursor 返回 `410 cursor_expired`，客户端清空临时状态并取新快照。Heartbeat comment 不占 outbox ID。SSE payload 只含 ref/摘要，不内联大 artifact。
