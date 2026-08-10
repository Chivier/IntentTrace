---
status: accepted
owner: architecture
last_reviewed: 2026-08-10
normative: true
milestone: post-Gate 5 runtime slimming
---

# ADR 0014：PostgreSQL 单源作业调度

## 背景

Gate 3 起，summary 作业的分发写成了「PostgreSQL 出队 → Redis 入队 → 同进程取回」的往返：`apps/worker/src/main.ts` 每 2 秒调用 `listRunnableSummaryJobIds()` 从 PostgreSQL 取出待办 ID，用 `queue.add()` 写进 Redis，再由同一进程内 `concurrency: 1` 的 BullMQ `Worker` 取回执行。队列两端都在同一个进程里。

复核这条链路时确认：**重试、退避与崩溃恢复完全不经过 BullMQ**。

- `failSummaryJob` 把作业置为 `status='failed'` 并设 `next_attempt_at = now() + 5s`；reducer 拒绝的 patch 与预算/provider 拒绝走 `retry=false`，置为 `status='cancelled'`、`next_attempt_at = null`，是取消而不是重试。
- `listRunnableSummaryJobIds` 的查询同时捞取 `next_attempt_at` 到期的 `pending`/`failed` 作业，以及 `status='running'` 且 `updated_at` 超过 5 分钟的作业——后者就是被杀死 worker 的收割器。`claimSummaryJob` 用同一组条件做带条件的原子 `UPDATE`，并递增 `attempt_count`。
- BullMQ 侧从未配置 `attempts`（默认 1 次），且 `removeOnComplete`/`removeOnFail` 均为 `true`，因此它既不重试也不保留死信。

换言之，队列层没有承担任何正确性或可用性职责，它只是把一个进程内的函数调用绕成了一次网络往返，代价是第三个运行时依赖、第三个 pinned 镜像与随之而来的第六个 Compose 服务、一个 native addon（经 `bullmq` → `msgpackr` 引入的 `msgpackr-extract`）、一个配置键、一个健康维度和一段威胁面。完整证据与实施范围见[运行时瘦身与队列移除设计](../../design/slim-runtime-and-queue-removal.md)。

## 决定

1. **PostgreSQL `summary_jobs` 是唯一的分发来源。** 不存在第二个投递媒介，作业状态机、退避与租约收割都由该表表达；`claimSummaryJob` 的条件 `UPDATE` 是唯一的领取权威。
2. **调度是进程内串行 runner。** `apps/worker/src/runner.ts` 的 `createSummaryRunner().runDueJobs()` 顺序处理当轮全部到期作业，`apps/worker/src/main.ts` 以 `SUMMARY_POLL_INTERVAL_MS`（2000 ms）轮询驱动，并用 in-flight 门跳过上一轮尚未跑完的 tick。并发保持 1，与被移除的 BullMQ `concurrency: 1` 一致。轮询延迟仍是最多 2 秒，与移除前相同，不是回退。
3. **崩溃恢复由租约而非队列承担。** worker 被杀死留下的 `running` 行在五分钟后被重新选中；退避重试由 `next_attempt_at` 驱动。这两条在移除前就已经是唯一生效的路径。
4. **`/readyz` 的依赖集缩小为 `{ postgres }`。** 这是一次**已发布响应契约的变更**，体现在生成的 [OpenAPI](../../contracts/api/openapi.yaml) 中。不保留 `redis: "skipped"` 占位：生成的契约只暴露真实存在的依赖，长期返回一个不存在的依赖项是不诚实的描述。当前消费者只有本仓库内的 Web 状态页与 Compose `api` healthcheck，且两者都只判断状态码，不读取 `dependencies` 结构。
5. **默认栈只有两个镜像。** `postgres` 与一个应用镜像；api/worker/web/migrate 四个服务共用该镜像的同一批层，加上 `postgres` 共五个 Compose 服务（`migrate` 为一次性）。`infra/images.lock` 相应地只固定两个 digest-pinned image。
6. **PostgreSQL 作业领取仍是正确性权威。** input hash、base revision、job nonce、唯一约束与单事务提交没有任何改动，因此 ADR 0006 关于幂等与 outbox 的结论原样成立，并且在移除一个 at-least-once 中间层之后更强。

## Superseded 范围

本 ADR **只** supersede 以下三处与队列传输相关的条款，三个 ADR 的其余结论全部继续有效：

| ADR                                                         | 被 supersede 的条款                                        | 继续成立的部分                                                                                                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`0006`](0006-transactional-outbox.md) transactional outbox | 「BullMQ 按 at-least-once 使用」「Redis 丢失可以重建投递」 | PostgreSQL input hash / base revision / 唯一约束保证正确性；raw insert、revision/job result、SSE event 各自与业务写入同事务；数据库提交前不得 ack |
| [`0008`](0008-typescript-monorepo.md) TypeScript monorepo   | 组成清单中的「BullMQ worker」                              | pnpm workspace + Turbo 布局、精确版本锁定、frozen lockfile、边界包分层与禁止跨层复制契约                                                          |
| [`0009`](0009-loopback-single-user.md) loopback 单用户      | 「Redis 只在私有 bridge 内可达」                           | 首发无 auth/RBAC/tenant；只有 Web 发布到 `127.0.0.1`；API 与 PostgreSQL 无宿主端口；任何公网/LAN 暴露都必须先新增认证与威胁模型                   |

三个原 ADR 的正文不修改，符合「一旦 Accepted 不改写结论」的仓库规则。

## 后果

优点：外部运行时依赖从三个减到两个；分发链路少一次网络往返与一个 native addon；`/readyz` 与 OpenAPI 只描述真实存在的依赖；排障面收敛到一张可用 SQL 直接查询的表（见 [Runbook：Summary 作业队列](../../operations/runbooks/queue-and-dlq.md)）。

代价：**不再提供跨主机 worker 水平扩展的现成路径。** 移除队列后 worker 与 API 只能靠共享数据库协调，仓库不再随栈提供任何分布式投递组件。ADR 0009 已经把首发定为单主机单用户，因此这是与既有边界一致的 YAGNI 取舍，而不是新的技术限制：`claimSummaryJob` 是带条件的原子 `UPDATE`，`summary_jobs` 本就支持多消费者，将来确需扩展时可以直接多进程（乃至多主机连同一个 PostgreSQL）竞争同一张表，或重新引入队列并新建 ADR。

`/readyz` 契约变更对仓库外消费者是破坏性的；当前没有仓库外消费者，风险局限在本仓库内。
