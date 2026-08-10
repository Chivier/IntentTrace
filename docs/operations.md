---
status: accepted
owner: maintainers
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0-Gate 5 与 macOS distribution
---

# 运维

本文覆盖 Compose 部署拓扑、健康与可观测性、备份恢复演练，以及 macOS Tauri 壳与 DMG 分发。故障处置步骤单独放在 [`operations/runbooks.md`](operations/runbooks.md)。

## 部署

正式验证拓扑是 Linux x86_64 单主机 Docker Compose：五个服务——`postgres`，以及共用同一个应用镜像的 `migrate`（一次性）、`api`、`worker`、`web`——但整栈只有两个镜像。macOS Tauri 壳复用同一拓扑并要求 Docker Desktop。默认只有 Web 发布到 Docker 自动分配的 `127.0.0.1` 临时端口；API、PostgreSQL、worker 和 migrate 均无宿主端口。PostgreSQL 与 artifacts 各用 named volume。

没有队列容器：summary 作业由 worker 直接轮询 PostgreSQL `summary_jobs` 分发，见 [ADR 0014](decisions.md#adr-0014postgresql-单源作业调度)。从带 Redis 的旧栈升级时，`pnpm docker:up` 的 `--remove-orphans` 只清理孤立容器，named volume 需要手工删除一次：`docker volume rm intenttrace_redis-data`（栈已停止时执行；仓库中不再有任何东西引用它）。网络不得设置固定全局 name 或 external reuse，以免两个 Compose project 的 `api`/`postgres` DNS alias 混用。PostgreSQL 与 API 采用同样的 internal-only 发布策略。扩大网络边界前必须增加认证和新的安全 ADR。

```bash
docker compose config --quiet
pnpm docker:up
pnpm docker:url
pnpm docker:status
```

`docker:up` 使用 Compose `--wait`，只有 migration 成功且带 healthcheck 的服务健康后才返回，并打印 Web、health 与 API status proxy 地址。需要固定入口时可临时设置 `INTENTTRACE_WEB_PORT`；不设置时由 Docker 分配空闲端口。镜像版本与解析 digest 记录在 `infra/images.lock`。此部署不具备 HA、rolling upgrade、公网 TLS 或 auth；不得直接改成 `0.0.0.0` 暴露宿主端口。

桌面归档由 `pnpm desktop:prepare` 生成且不进 Git；Tauri Rust 只用硬编码参数调用 Docker CLI，不给前端通用 shell 权限。DMG 构建必须在 macOS；对外分发还必须完成 Apple codesign/notarization。详见 [macOS Tauri 与 DMG](#macos-tauri-与-dmg)。

## 可观测性

API 提供 `/healthz`（进程）、`/readyz`、`/version` 和最小 Prometheus `/metrics`；web 提供 `/healthz` 与 readiness proxy。`/readyz` 的 `dependencies` 只有 `postgres` 一项，这是生成 OpenAPI 里的已发布响应契约，不含任何占位依赖。日志是结构化 server log并 redacts authorization/cookie。Worker 日志声明轮询间隔与 provider；provider-call audit 保存 model/hash/usage/cost，不保存正文。

当前 outbox/job/provider tables 可诊断 watermark、attempt、失败码、SSE backlog 和 token/cost。更细的 ingest/latency histogram 仍是 post-MVP observability enhancement；label 禁止 raw text、user path、event ID 高基数或 key。

告警应指向 runbook，并区分 liveness、dependency readiness 与产品降级。Provider outage 不是 raw browsing outage；worker 或 provider 故障不应把 PostgreSQL 已入库 trace 标丢失。

## 备份与恢复

一致备份包含 PostgreSQL dump/physical snapshot、artifact volume 和 manifest（commit、migration、image digest、每 trace artifact hash）。没有需要单独备份的队列存储：作业分发状态就在 `summary_jobs` 里，随数据库一起恢复，未完成的作业按 `next_attempt_at` 与五分钟 `running` 租约自行被重新领取。

演练：停止写入或取得一致 watermark → 备份 DB/artifact → 在空目录启动锁定版本 → restore DB → restore artifacts → migrate no-op → 校验 row counts/hash/revision memberships → 启动服务 → raw/status/SSE smoke。原环境保留到校验完成。

`pnpm backup -- <directory>` 创建 PostgreSQL custom dump、artifact tar 和逐文件 SHA-256 manifest。`pnpm backup:verify -- <directory>` 校验 hash/tar，并恢复到临时隔离数据库核对 trace/raw/revision counts，最后删除临时库。2026-08-03 合成环境演练通过；它不等于用户真实磁盘故障恢复证据。备份文件按 trace 同等敏感处理。

## macOS Tauri 与 DMG

`apps/desktop` 是 Tauri 2 launcher，不是另一套数据库实现。`pnpm desktop:prepare` 生成过滤后的 `intenttrace-stack.tar.gz`；bundle 首次运行把它安全释放到 app local-data，查找 Docker Desktop CLI，以固定 `docker compose -p intenttrace-desktop` 参数构建栈，再查询 Docker 动态分配的 `127.0.0.1` Web 端口并打开 `/traces`。前端没有通用 shell permission。

本地 macOS 构建：安装 Xcode Command Line Tools、Rust、Node/pnpm 和 Docker Desktop，然后执行：

```bash
pnpm install --frozen-lockfile
pnpm desktop:prepare
pnpm --filter @intenttrace/desktop tauri build --target universal-apple-darwin --bundles dmg
```

`.github/workflows/macos-dmg.yml` 提供手动 universal build。对外分发必须配置 `APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID`，并保存 codesign/notarization/staple/安装证据；无凭据产物只能作为内部未签名构建，不得称为 release。DMG 启动仍依赖 Docker Desktop，且只支持 macOS 12+、桌面宽度至少 1024px。

Linux evidence 仅覆盖 JSON/CSP、Rust formatting、Cargo dependency lock 和资源归档；Tauri WebKit native compile、DMG、Apple signature/notarization 均是 macOS 独立门禁。
