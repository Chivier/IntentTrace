# IntentTrace

IntentTrace 将多智能体执行事件整理为可回放、可验证的 Evidence-backed Intent Graph。当前仓库完成的是 **Gate 0 工程与设计基线**：可运行服务壳、领域契约、数据库迁移、基础设施、质量门禁和完整施工文档；尚未实现完整 Trace Viewer 或真实模型总结。

## 快速开始

要求 Node 24、Corepack、Docker 与 Docker Compose。

```bash
corepack pnpm install --frozen-lockfile
docker compose -f infra/compose.yaml up --build
```

启动后访问：

- Web 状态页：<http://127.0.0.1:3000>
- API 健康检查：<http://127.0.0.1:3001/healthz>
- API 文档：<http://127.0.0.1:3001/documentation>

完整开发、验证和后续施工说明见 [`docs/README.md`](docs/README.md)。

## 当前边界

- 本地单用户，服务仅绑定 loopback，无认证和多租户。
- 云 provider 默认关闭；不会自动读取 Codex/Claude session。
- 原始设计包和 UI 原型是历史输入与视觉参考，不是实现或测试证据。
- 私有项目，未授予开源许可（`UNLICENSED`）。
