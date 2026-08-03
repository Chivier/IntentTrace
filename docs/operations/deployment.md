---
status: accepted
owner: operations
last_reviewed: 2026-08-03
normative: true
milestone: Gate 0
---

# 部署

Gate 0 唯一支持拓扑是当前 Linux x86_64 单主机 Docker Compose。默认只有 Web 发布到 Docker 自动分配的 `127.0.0.1` 临时端口；API、PostgreSQL、Redis、worker 和 migrate 均无宿主端口。PostgreSQL、Redis 与 artifacts 各用 named volume；Redis 开 AOF、`appendfsync everysec` 和 `noeviction`。

Redis 在命名的 `intenttrace-private` Compose bridge 内监听容器接口，因此 `protected-mode` 关闭以允许 API/worker 连接；宿主、LAN 和公网均不可直接访问 Redis。PostgreSQL 与 API 采用同样的 internal-only 发布策略。扩大网络边界前必须增加认证和新的安全 ADR。

```bash
docker compose config --quiet
pnpm docker:up
pnpm docker:url
pnpm docker:status
```

`docker:up` 使用 Compose `--wait`，只有 migration 成功且带 healthcheck 的服务健康后才返回，并打印 Web、health 与 API status proxy 地址。需要固定入口时可临时设置 `INTENTTRACE_WEB_PORT`；不设置时由 Docker 分配空闲端口。镜像版本与解析 digest 记录在 `infra/images.lock`。此部署不具备 HA、rolling upgrade、公网 TLS 或 auth；不得直接改成 `0.0.0.0` 暴露宿主端口。
