---
status: current
owner: developer-experience
last_reviewed: 2026-08-03
normative: true
milestone: Gate 5
---

# 开始开发

要求 Linux x86_64、Node `24.18.0`、pnpm `11.18.0`（Corepack）、Docker/Compose。不要复制真实 provider key 或 session。

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install --frozen-lockfile
pnpm docker:up
pnpm docker:url
pnpm demo:load
```

默认全栈全部运行在 Docker 中，命令打印唯一的动态 loopback Web 地址。`demo:load` 只导入固定 seed 合成 fixture。Collector 用 `pnpm --filter @intenttrace/collector dev -- import --source … --path … --api <web-origin>`；它会读取且只读取显式路径，默认拒绝 symlink，并把归一化事件发到 Web 内部代理。

API、PostgreSQL 和 Redis 只通过 `intenttrace-private` 网络及服务 DNS 名互联，容器内部端口分别为 3001、5432 和 6379，宿主没有对应 listener。只有确需调试宿主进程时才使用显式、临时的 Compose override；不得把固定数据库端口重新加入默认拓扑。

源码检查与构建仍可在宿主运行。备份使用 `pnpm backup -- <dir>`，恢复演练使用 `pnpm backup:verify -- <dir>`。macOS 壳运行 `pnpm desktop:prepare`，真正 DMG 只能在 macOS 执行 `pnpm desktop:build`。提交前执行 AGENTS/CI 的完整质量命令。
