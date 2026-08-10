---
status: accepted
owner: maintainers
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0-Gate 5
---

# 参考

配置键表与术语表。配置表由 `scripts/check-docs.mjs` 对 `packages/config/src/index.ts` 逐键校验，新增配置键必须同时更新这里。

## 配置参考

| 变量                        | 默认值                                     | 约束/用途                        |
| --------------------------- | ------------------------------------------ | -------------------------------- |
| `NODE_ENV`                  | `development`                              | development/test/production      |
| `LOG_LEVEL`                 | `info`                                     | Pino level，敏感 header redacted |
| `APP_VERSION`               | `0.0.0`                                    | `/version` build version         |
| `GIT_COMMIT`                | `development`                              | `/version` provenance            |
| `API_HOST`                  | `127.0.0.1`                                | 宿主开发不可改公网               |
| `API_PORT`                  | `3001`                                     | 1–65535                          |
| `DATABASE_URL`              | `postgres://…@127.0.0.1:15432/intenttrace` | PostgreSQL URL                   |
| `ARTIFACT_ROOT`             | `.intenttrace/artifacts`                   | resolve 为绝对本地路径           |
| `IMPORT_UPLOAD_MAX_BYTES`   | `67108864`                                 | 64 KiB–512 MiB；浏览器上传上限   |
| `PROVIDER_MODE`             | `mock`                                     | `mock`、`openai` 或 `deepseek`   |
| `PROVIDER_EGRESS_ENABLED`   | `false`                                    | cloud mode 必须显式 true         |
| `PROVIDER_DAILY_BUDGET_USD` | `0`                                        | cloud mode 必须为正              |
| `PROVIDER_TIMEOUT_MS`       | `30000`                                    | 1000–120000                      |
| `PROVIDER_MAX_EVENTS`       | `256`                                      | egress event-sketch 上限         |
| `OPENAI_API_KEY`            | 未设置                                     | 仅 openai mode 必需，不记录      |
| `OPENAI_MODEL`              | 未设置                                     | 必须明确；示例 `gpt-5.6-sol`     |
| `OPENAI_BASE_URL`           | `https://api.openai.com/v1`                | host 必须为 `api.openai.com`     |
| `DEEPSEEK_API_KEY`          | 未设置                                     | 仅 deepseek mode 必需            |
| `DEEPSEEK_MODEL`            | 未设置                                     | 示例 `deepseek-v4-flash`         |
| `DEEPSEEK_BASE_URL`         | `https://api.deepseek.com`                 | host 必须为 `api.deepseek.com`   |
| `INTENTTRACE_API_ORIGIN`    | `http://127.0.0.1:3001`                    | web server-side health proxy     |
| `INTENTTRACE_WEB_PORT`      | 空                                         | Compose 专用；空则自动分配端口   |

`PROVIDER_TIMEOUT_MS` 与 Compose `stop_grace_period` 耦合：worker 的关机预算是 `summaryJobBudgetMs(PROVIDER_TIMEOUT_MS)`（即 `PROVIDER_TIMEOUT_MS + SUMMARY_STATEMENT_TIMEOUT_MS` 30000 ms）加 `SHUTDOWN_POOL_TIMEOUT_SECONDS`（5 s）加 `SHUTDOWN_FORCE_EXIT_DELAY_MS`（1000 ms），三者都定义在 `apps/worker/src/policy.ts`。默认 30000 ms 下最坏情况是 66 s，`infra/compose.yaml` 的 `stop_grace_period: 75s` 覆盖它。把 `PROVIDER_TIMEOUT_MS` 提高到上限 120000 ms 会让最坏情况变成 156 s，超过 75 s 后 worker 在排空中途被 SIGKILL：正在跑的作业留下 `status='running'` 行，由五分钟租约回收，不损坏数据但会丢一次已计费的 provider 调用。**提高 `PROVIDER_TIMEOUT_MS` 必须同步提高 `stop_grace_period`**；没有脚本校验这条关系。

配置 loader 忽略无关环境变量但严格校验已知字段；`REDIS_URL` 已随队列移除从 schema 中删除，loader 不再接受该键。`.env.example` 可提交，`.env` 与任何 key 不提交。表中的 host-run 默认 URL 只用于显式的本地进程开发；默认 Compose 会注入 `postgres:5432` 与 `api:3001` 服务地址且不发布这些端口。Compose 容器内部 API 可监听 `0.0.0.0`，但唯一 Web 宿主映射必须是 `127.0.0.1`；二者不是同一安全边界。

## Glossary

- **ETG (Execution Trace Graph)**：不可变 raw execution facts 与 lineage。
- **EIG (Evidence-backed Intent Graph)**：从 ETG 派生、可版本化并逐 claim 证据支撑的语义图。
- **RawTraceEvent**：规范化、版本化的事实 envelope；正文以 hash/ref 保存。
- **logical ID / version ID**：跨 revision 稳定身份 / 单次 immutable 内容版本。
- **revision**：在一个 event watermark 上的 node/edge membership 快照。
- **watermark**：该视图已纳入的最大 `ingestSeq`；不是 source time。
- **event sketch**：机械压缩、redacted、面向 provider 的最小输入。
- **patch**：provider 提议的显式 graph operations；不是已提交语义。
- **reducer**：确定性验证、canonicalize 并 transaction commit patch 的组件。
- **evidence**：claim 到 raw event/artifact 的可审计引用。
- **ghost state**：chunk pending 的确定性 UI 状态，不含未验证模型输出。
- **ArtifactStore**：`put/stat/getRange/deleteTrace` 的大对象边界。
- **source identity**：adapter 来源中用于幂等的 session/event 组合。
- **outbox**：与业务写入同事务持久化、用于 SSE/queue 发布的事件记录。
- **raw-only**：semantic pipeline 不可用时仍能浏览已入库事实的降级模式。
