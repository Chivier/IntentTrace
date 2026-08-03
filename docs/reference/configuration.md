---
status: accepted
owner: developer-experience
last_reviewed: 2026-08-03
normative: true
milestone: Gate 5
---

# 配置参考

| 变量                        | 默认值                                     | 约束/用途                        |
| --------------------------- | ------------------------------------------ | -------------------------------- |
| `NODE_ENV`                  | `development`                              | development/test/production      |
| `LOG_LEVEL`                 | `info`                                     | Pino level，敏感 header redacted |
| `APP_VERSION`               | `0.0.0`                                    | `/version` build version         |
| `GIT_COMMIT`                | `development`                              | `/version` provenance            |
| `API_HOST`                  | `127.0.0.1`                                | 宿主开发不可改公网               |
| `API_PORT`                  | `3001`                                     | 1–65535                          |
| `DATABASE_URL`              | `postgres://…@127.0.0.1:15432/intenttrace` | PostgreSQL URL                   |
| `REDIS_URL`                 | `redis://127.0.0.1:16379`                  | Redis URL                        |
| `ARTIFACT_ROOT`             | `.intenttrace/artifacts`                   | resolve 为绝对本地路径           |
| `PROVIDER_MODE`             | `mock`                                     | `mock                            | openai | deepseek` |
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

配置 loader 忽略无关环境变量但严格校验已知字段。`.env.example` 可提交，`.env` 与任何 key 不提交。表中的 host-run 默认 URL 只用于显式的本地进程开发；默认 Compose 会注入 `postgres:5432`、`redis:6379` 与 `api:3001` 服务地址且不发布这些端口。Compose 容器内部 API 可监听 `0.0.0.0`，但唯一 Web 宿主映射必须是 `127.0.0.1`；二者不是同一安全边界。
