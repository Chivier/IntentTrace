---
status: current
owner: developer-experience
last_reviewed: 2026-08-06
normative: true
milestone: Gate 5
---

# 开始开发

要求 Linux x86_64、Node `24.18.1`、pnpm `11.18.0`（Corepack）、Docker/Compose。不要复制真实 provider key 或 session。

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install --frozen-lockfile
pnpm docker:up
pnpm docker:url
pnpm demo:load
```

默认全栈全部运行在 Docker 中，命令打印唯一的动态 loopback Web 地址。`demo:load` 只导入固定 seed 合成 fixture。Collector 先用 `… dev discover --source … --path …` 在显式授权根内返回 versioned、默认无 prompt 正文的 catalog，再用 `… dev import --source … --path … --session <opaque-id> --api <web-origin>` 精确导入；`--session` 可重复。它不会自动扫描 home，默认拒绝每层 symlink，并把完整 preflight 后的归一化事件发到 Web 内部代理。无选择器的原批量 import 仍保留。

API、PostgreSQL 和 Redis 只通过 Compose project-scoped private network（默认项目为 `intenttrace_default`）及服务 DNS 名互联，容器内部端口分别为 3001、5432 和 6379，宿主没有对应 listener。不同 `-p` 项目拥有独立 network/volume，避免桌面壳、干净验收栈与开发栈之间的同名 DNS 污染。只有确需调试宿主进程时才使用显式、临时的 Compose override；不得把固定数据库端口重新加入默认拓扑。

源码检查与构建仍可在宿主运行。备份使用 `pnpm backup -- <dir>`，恢复演练使用 `pnpm backup:verify -- <dir>`。macOS 壳运行 `pnpm desktop:prepare`，真正 DMG 只能在 macOS 执行 `pnpm desktop:build`。提交前执行 AGENTS/CI 的完整质量命令。
