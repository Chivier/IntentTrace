# IntentTrace

IntentTrace 将多智能体执行事件整理为可回放、可验证的 Evidence-backed Intent Graph。仓库已实现本地 single-host MVP：四类导入、raw/replay/Gantt、durable SSE、确定性 mock semantic pipeline、Graph/Evidence 联动、human revision、备份恢复和 Tauri macOS 壳。云模型仍默认关闭。

## 快速开始

要求 Node 24、Corepack、Docker 与 Docker Compose。

```bash
corepack pnpm install --frozen-lockfile
pnpm docker:up
pnpm demo:load
```

命令会打印 Docker 自动分配的 Web 地址；之后可随时运行 `pnpm docker:url` 查询。默认只有 Web 发布到宿主的 `127.0.0.1` 临时端口，API、PostgreSQL 和 Redis 仅在 Compose 私有网络内可达，因此不会占用固定宿主端口。

如确实需要稳定 Web 端口，可显式执行 `INTENTTRACE_WEB_PORT=13000 pnpm docker:up`；端口选择与冲突处理由操作者负责。使用 `pnpm docker:status` 查看服务，`pnpm docker:down` 停止服务但保留 named volumes。

打开 `pnpm docker:url` 输出的 `/traces`。完整开发、验证和施工证据见 [`docs/README.md`](docs/README.md) 与 [`docs/project/progress.md`](docs/project/progress.md)。

## 当前边界

- 本地单用户，服务仅绑定 loopback，无认证和多租户。
- 云 provider 默认关闭；不会自动读取 Codex/Claude session。
- macOS DMG 源码与构建门禁已具备，但可分发 DMG 必须在 macOS 上用 Apple 身份完成 codesign/notarization。
- 原始设计包和 UI 原型是历史输入与视觉参考，不是实现或测试证据。
- 私有项目，未授予开源许可（`UNLICENSED`）。
