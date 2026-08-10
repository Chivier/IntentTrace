---
status: accepted
owner: operations
last_reviewed: 2026-08-10
normative: true
milestone: Gate 5
---

# 部署

正式验证拓扑是 Linux x86_64 单主机 Docker Compose：五个服务——`postgres`，以及共用同一个应用镜像的 `migrate`（一次性）、`api`、`worker`、`web`——但整栈只有两个镜像。macOS Tauri 壳复用同一拓扑并要求 Docker Desktop。默认只有 Web 发布到 Docker 自动分配的 `127.0.0.1` 临时端口；API、PostgreSQL、worker 和 migrate 均无宿主端口。PostgreSQL 与 artifacts 各用 named volume。

没有队列容器：summary 作业由 worker 直接轮询 PostgreSQL `summary_jobs` 分发，见 [ADR 0014](../architecture/adr/0014-postgres-only-job-dispatch.md)。从带 Redis 的旧栈升级时，`pnpm docker:up` 的 `--remove-orphans` 只清理孤立容器，named volume 需要手工删除一次：`docker volume rm intenttrace_redis-data`（栈已停止时执行；仓库中不再有任何东西引用它）。网络不得设置固定全局 name 或 external reuse，以免两个 Compose project 的 `api`/`postgres` DNS alias 混用。PostgreSQL 与 API 采用同样的 internal-only 发布策略。扩大网络边界前必须增加认证和新的安全 ADR。

```bash
docker compose config --quiet
pnpm docker:up
pnpm docker:url
pnpm docker:status
```

`docker:up` 使用 Compose `--wait`，只有 migration 成功且带 healthcheck 的服务健康后才返回，并打印 Web、health 与 API status proxy 地址。需要固定入口时可临时设置 `INTENTTRACE_WEB_PORT`；不设置时由 Docker 分配空闲端口。镜像版本与解析 digest 记录在 `infra/images.lock`。此部署不具备 HA、rolling upgrade、公网 TLS 或 auth；不得直接改成 `0.0.0.0` 暴露宿主端口。

桌面归档由 `pnpm desktop:prepare` 生成且不进 Git；Tauri Rust 只用硬编码参数调用 Docker CLI，不给前端通用 shell 权限。DMG 构建必须在 macOS；对外分发还必须完成 Apple codesign/notarization。详见 [`macos-desktop.md`](macos-desktop.md)。
