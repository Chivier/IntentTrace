# Contributing to IntentTrace

感谢你帮助改进 IntentTrace。Bug 报告、文档修复、匿名 adapter fixture、可访问性改进和范围清晰的代码 PR 都很有价值。

参与前请阅读：

- [`AGENTS.md`](AGENTS.md)：工程不变量与必跑门禁
- [`docs/architecture.md`](docs/architecture.md#系统不变量)：架构边界
- [`SECURITY.md`](SECURITY.md)：漏洞与敏感数据报告方式
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)：社区行为准则

## 先开 Issue 的变更

以下工作请先通过 Issue 对齐问题、边界与替代方案：

- 新数据源 adapter 或 provider
- Zod/Drizzle/OpenAPI 契约变化
- migration、保留/删除语义或安全边界变化
- 大规模 UI/架构重构
- 新外部依赖或许可证变化

小型 Bug、测试和文档修复可以直接提交 PR。

## 本地开发

要求 Node `24.18.1`、pnpm `11.18.0`、Corepack 与 Docker Compose v2。

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install --frozen-lockfile
pnpm docker:up
pnpm demo:load
pnpm docker:url
```

更详细的环境说明见 [`docs/development.md`](docs/development.md#开始开发)。

## 变更原则

1. Raw execution event 是 append-only fact；模型输出不得覆盖它。
2. user intent、agent intention、observed action 和 outcome 必须分开。
3. LLM 只返回 proposal；deterministic reducer 拥有校验与提交权。
4. semantic graph 必须 revisioned、evidence-backed。
5. 没有 summary provider 时，raw trace/evidence 路径仍需可用。
6. 不重建、不提交、不展示隐藏 chain-of-thought。
7. 契约变化应一起更新 schema、migration、API、fixture、测试与文档；生成的 JSON Schema/OpenAPI 不得手改。

## 测试

提交 PR 前运行完整门禁：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contract
pnpm test:e2e
pnpm build
pnpm docs:check
pnpm schema:check
```

涉及 Compose、migration 或依赖时，还应运行：

```bash
pnpm audit --prod
pnpm docker:check
pnpm db:migrate
pnpm db:migrate
```

环境不允许执行某一项时，请在 PR 中明确写出未执行项、原因与风险，不要把 authored、automated、environment 或 external evidence 混为一谈。

## Commit 与 PR

- 一个分支聚焦一个可审阅边界，避免顺带重构。
- Commit message 建议使用 `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`。
- PR 使用仓库模板，分别记录契约/migration 影响、验证证据、文档更新与剩余风险。
- UI 截图只能证明所展示的界面，不证明后端语义正确。
- 依赖升级应说明许可证、migration 和 release artifact 影响。

## 数据与隐私

只能提交合成或不可逆匿名化 fixture。不要把以下内容放进 Git、Issue、PR、CI log 或截图：

- provider/API key、cookie、Authorization header 或 `.env`
- 真实 Codex/Claude session、完整 terminal log 或数据库 dump
- 用户 trace payload、未匿名源码、私有文件路径/session ID
- hidden reasoning/thinking、内部 snapshot 或 prompt response 正文

如果变更需要真实数据验证，请仅记录去标识化的计数和结果，遵守 [`docs/security.md`](docs/security.md#数据处理)。

## Developer Certificate of Origin

提交贡献即声明你有权按项目许可证提供该贡献，并同意 [Developer Certificate of Origin 1.1](https://developercertificate.org/)：

```text
Signed-off-by: Your Name <your.email@example.com>
```

请使用 `git commit -s` 添加签署行。除非你明确另行声明，提交并被项目接收的贡献将按项目的 `AGPL-3.0-only` 许可证提供。
