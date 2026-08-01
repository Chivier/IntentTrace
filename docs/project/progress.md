---
status: current
owner: program
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# 实施进度

证据日期 2026-08-01；环境 Linux x86_64，workspace `/home/chivier/Projects/IntentTrace`。初始化 commit 以本地 repository HEAD 为准。

## Planned

- Gate 1–5 全部能力，详见 construction plan。

## Implemented

- monorepo、精确依赖声明、strict TypeScript/format/lint/test/build 配置。
- 状态页、API 三个真实路由、worker queue-only 骨架、Collector explicit-path validator。
- Zod/domain/provider patch、config、storage、ingest、adapter、summarizer、reducer、layout/UI/fixture contracts。
- Drizzle schema、Compose/Redis policy、CI、原始设计 archive/source/prototype lock、完整文档基线。

## Automated verified

- 在锁定的 `node:24.18.0-bookworm-slim@sha256:6f7b…1452d` Linux/amd64 容器内，pnpm `11.18.0` 使用独立临时 store 执行 frozen install 后，下列命令全部退出 0：

  ```bash
  pnpm format:check
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm test:contract
  pnpm test:e2e
  pnpm build
  pnpm docs:check
  pnpm schema:check
  ```

- Unit：12 files / 21 tests；contract：6 files / 10 tests；Playwright：2 tests；Turbo build：15 packages。
- 在独立 detached clean worktree 中重复完成 frozen install、Compose 全量 build/up 与两次 migration；checkout 保持无已跟踪改动。
- Docs check：61 个规范 Markdown 文件、必需目录/内链、11 个 ADR、配置键、原始 ZIP 与逐文件 SHA-256 全部通过。
- Schema check：7 个生成 JSON Schema、实际 Fastify OpenAPI 与 Drizzle migration 无 drift；OpenAPI 只有 `/healthz`、`/readyz`、`/version`。
- Collector `--help` 显示固定 import/follow 命令并声明 `validated_not_read` Gate 0 边界；路径/symlink 行为由 3 个 unit tests 验证。

## Environment verified

- `docker compose config --quiet` 与 `docker compose up -d --build` 退出 0；web/api/PostgreSQL/Redis health 均为 healthy，worker 日志确认只连接 queue 且不消费任务。
- `curl` 验证 API liveness、PostgreSQL/Redis readiness、version/schema version，以及 web status/health 页面；页面明确写明“尚未实现完整 Trace Viewer”。
- 宿主发布地址仅为 `127.0.0.1:3000`、`:3001`、`:15432`、`:16379`。因宿主已有服务占用 5432/6379，IntentTrace 使用独立 loopback 映射；容器内部仍是标准端口。
- 锁定并运行 PostgreSQL `18.4`、Redis `7.2.14` 与 Node `24.18.0` image digest；Redis AOF、named volume、`noeviction` 生效。
- 新 named volume 上 migration 首次成功；随后宿主连续两次 `pnpm db:migrate` 均安全 no-op。数据库有 19 个业务表和 8 个 immutable-update trigger。
- 未配置 provider key、未发起模型调用、未读取真实 Codex/Claude session。

## Deferred

- 四 adapter 真实解析、2,000-event fixture、raw viewer/SSE/replay、semantic revisions/pipeline、real providers、backup/restore/performance/release drills。

## Blocked

- 无 Gate 0 blocker。正式 provider 与用户数据验证被 Gate 4 安全门有意阻止，不属于 Gate 0 blocker。
