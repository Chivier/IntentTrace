# Support

IntentTrace 当前是由志愿者维护的 local MVP，不提供商业支持或响应时间 SLA。

## 使用问题

1. 先查看 [`README.md`](README.md)、[`docs/README.md`](docs/README.md) 和[部署文档](docs/operations/deployment.md)。
2. 运行 `pnpm docker:status`、`pnpm docker:url`，确认只有 Web 绑定 loopback。
3. 在 GitHub Discussions（如仓库已启用）提问；否则创建使用问题 Issue。

公开提问时请包含操作系统、Node/pnpm/Docker 版本、相关命令、预期行为和经过清理的错误信息。不要粘贴真实 trace、Codex/Claude session、API key、`.env`、数据库 dump、完整日志、私有源码或文件路径。

## Bug 与功能建议

请使用仓库的 Bug report 或 Feature request 模板。先搜索重复 Issue；用最小合成 fixture 复现，并明确区分实际执行结果和预期结果。

## 安全问题

安全漏洞不要走公开支持渠道。请遵循 [`SECURITY.md`](SECURITY.md) 的私密报告流程。
