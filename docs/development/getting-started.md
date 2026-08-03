---
status: current
owner: developer-experience
last_reviewed: 2026-08-03
normative: true
milestone: Gate 0
---

# 开始开发

要求 Linux x86_64、Node `24.18.0`、pnpm `11.18.0`（Corepack）、Docker/Compose。不要复制真实 provider key 或 session。

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install --frozen-lockfile
pnpm docker:up
pnpm docker:url
```

默认全栈全部运行在 Docker 中，命令打印唯一的动态 loopback Web 地址。浏览器通过 Web 的 `/api/status` 观察 API readiness；API 本身不发布宿主端口。Collector Gate 0 示例 `pnpm --filter @intenttrace/collector dev -- --help`；路径命令只做校验，不读取内容。

API、PostgreSQL 和 Redis 只通过 `intenttrace-private` 网络及服务 DNS 名互联，容器内部端口分别为 3001、5432 和 6379，宿主没有对应 listener。只有确需调试宿主进程时才使用显式、临时的 Compose override；不得把固定数据库端口重新加入默认拓扑。

源码检查与构建仍可在宿主运行。提交前执行 README/CI 中的完整质量命令；Node 版本不一致时停止，不用 `--ignore-engines` 绕过。
