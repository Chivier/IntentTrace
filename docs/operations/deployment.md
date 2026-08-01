---
status: accepted
owner: operations
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# 部署

Gate 0 唯一支持拓扑是当前 Linux x86_64 单主机 Docker Compose。`web/api/postgres/redis` 映射只用 `127.0.0.1`；worker/migrate 无宿主端口。PostgreSQL、Redis 与 artifacts 各用 named volume；Redis 开 AOF、`appendfsync everysec` 和 `noeviction`。

Redis 在隔离的 Compose bridge 内监听容器接口，因此 `protected-mode` 关闭以允许 API/worker 连接；它无公网/LAN 映射，宿主只在 `127.0.0.1:16379` 可达。扩大网络边界前必须增加认证和新的安全 ADR。

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3001/readyz
curl --fail http://127.0.0.1:3000/healthz
```

`migrate` 必须成功后 API/worker 启动。镜像版本与解析 digest 记录在 `infra/images.lock`。此部署不具备 HA、rolling upgrade、公网 TLS 或 auth；不得直接改成 `0.0.0.0` 暴露宿主端口。
