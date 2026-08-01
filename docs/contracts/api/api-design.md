---
status: draft
owner: api
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 2
---

# API 设计

Gate 0 已实现且唯一公开记录的路由是 `GET /healthz`、`GET /readyz`、`GET /version`；以生成的 [`openapi.yaml`](openapi.yaml) 为准。`/documentation` 是本地 OpenAPI UI，不算业务 API。

计划业务 REST 统一 `/api/v1`，资源包括 projects、traces、events、revisions、artifacts 和 stream snapshot。OTLP receiver 独立遵循 `POST /v1/traces`，返回标准 partial success。所有写入使用结构化 Problem Details；分页 cursor 不用裸 offset。

计划接口在代码、测试和生成 OpenAPI 同时存在前保持 Draft，不得加入实际 OpenAPI。API 只访问数据库/ArtifactStore，不读取任意宿主机路径。
