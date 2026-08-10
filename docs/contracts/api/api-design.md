---
status: accepted
owner: api
last_reviewed: 2026-08-09
normative: true
milestone: Gate 5
---

# API 设计

实际路由以生成的 [`openapi.yaml`](openapi.yaml) 为准。除 health/readiness/version/metrics 外，已实现 event ingest、trace list/detail/delete、raw pagination、snapshot、graph revision、revision list（`GET /api/v1/traces/{traceId}/revisions`，按创建时间倒序，供 Live/Final 切换定位 revision）、human node edit、provider-call audit、artifact range、SSE、浏览器会话导入（`POST /api/v1/imports/candidates` 与 `POST /api/v1/imports/sessions`）以及标准 OTLP JSON receiver。`/documentation` 是本地 OpenAPI UI，不算业务 API。

业务 REST 统一 `/api/v1`；OTLP receiver 独立使用 `POST /v1/traces` 并返回 partial success。Source identity collision 返回 `409 integrity_conflict`；删除要求 `confirm` 精确等于 trace ID；human edit 必须携带 current `baseRevisionId`。分页和 SSE 使用单调 cursor，不能用 source time 代表“当时已知”。

API 只访问数据库/ArtifactStore，不读取任意宿主机路径。`imports/*` 两条路由只解析请求体里已经到达的字节，不接受路径参数、不枚举目录；`imports/candidates` 检查每个候选的 bounded head 并只发一次批量 trace 查询，`imports/sessions` 以 `application/octet-stream` 接收整份 session 并复用与 collector 相同的完整 preflight 和内容哈希 `trace_complete` 标记。未实现的 project 管理、auth、gRPC 和 provider registry mutation 仍只留在设计文档，不得手改生成 OpenAPI。
