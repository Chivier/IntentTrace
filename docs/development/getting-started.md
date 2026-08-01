---
status: current
owner: developer-experience
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# 开始开发

要求 Linux x86_64、Node `24.18.0`、pnpm `11.18.0`（Corepack）、Docker/Compose。不要复制真实 provider key 或 session。

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d postgres redis
pnpm db:migrate
pnpm dev
```

Web 为 `127.0.0.1:3000`，API 为 `127.0.0.1:3001`。也可用 `docker compose up -d --build` 启动全栈。Collector Gate 0 示例 `pnpm --filter @intenttrace/collector dev -- --help`；路径命令只做校验，不读取内容。

Compose 把 PostgreSQL 与 Redis 分别映射到 `127.0.0.1:15432` 和 `127.0.0.1:16379`，避免占用宿主已有的标准端口；容器网络内部仍使用 5432/6379。

提交前运行 README/CI 中的完整质量命令。Node 版本不一致时停止，不用 `--ignore-engines` 绕过。
