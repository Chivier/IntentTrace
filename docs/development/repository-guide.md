---
status: current
owner: maintainers
last_reviewed: 2026-08-03
normative: true
milestone: Gate 5
---

# 仓库指南

`apps/web` 是状态页和 Trace Workbench，`apps/api` 是 Fastify REST/OTLP/SSE，`apps/worker` 是异步语义 pipeline，`apps/collector` 是显式路径 CLI，`apps/desktop` 是 Tauri Docker 启动壳。共享包按依赖方向分层：schema/config → db/storage/ingest/adapters → summarizer/reducer/layout/ui/fixtures。App 可以组合 package；低层 package 不依赖 app。

`docs/design/source` 只保存历史输入；`generated/` JSON Schema、OpenAPI 和 Drizzle migration 属于需要提交的产物。`infra` 保存 Compose、Redis 配置和 image lock。真实 `.env`、session、artifact volume 和 provider key 永不提交。

修改契约时同时更新代码、测试、生成物和相应规范文档。不要把 prototype HTML/CSS 复制到 Next；重建组件时以 accessibility 和真实状态为准。
