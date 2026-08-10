---
status: draft
owner: operations
last_reviewed: 2026-08-10
normative: true
milestone: Gate 2-Gate 5 与 post-Gate 5 runtime slimming
---

# Runbooks

四份故障处置手册：provider 不可用、summary 作业表异常、数据存储故障、SSE 补发。除 summary 作业队列一节外，其余三节的来源文档状态仍为 `draft`。

## Runbook：Provider outage

症状：provider timeout/429/5xx、bad JSON、预算耗尽，summary job age 上升；raw ingest/query 正常。先确认 egress 是否被显式启用和 registry/model snapshot，检查仅含 hash/status 的审计，不打印 prompt/key。

处置：关闭真实 provider 或保持 raw-only；暂停相应 job 的重试，使用有上限退避；不切换到另一 provider；验证 API/raw UI 可用。恢复后只重放仍匹配 base revision/input hash 的 job，过期 job 重新 chunk。

结束条件：错误率和 queue age 恢复，抽样 patch 通过 reducer，无 secret 日志。记录影响 trace、时间、provider/model 和成本；不称 ingestion 中断。

## Runbook：Summary 作业队列

_来源文档状态为 `accepted`。_

没有外部队列。分发只有一张表 `summary_jobs`，由 worker 每 2 秒（`SUMMARY_POLL_INTERVAL_MS`）轮询、串行处理，并发为 1。排障对象就是这张表，见 [ADR 0014](../decisions.md#adr-0014postgresql-单源作业调度)。

症状：`summary_jobs` 有行长期停在 `status='running'`；`attempt_count` 持续上升；worker crash loop（容器反复重启或日志反复出现 `summary job … failed`）；`pending` 行的 `created_at` 年龄增长而 `committed` 不增加；UI 持续显示 raw-only。

处置：先按状态定位，不要先动数据。

```sql
select status, count(*), min(created_at), max(attempt_count), max(last_error_code)
from summary_jobs group by status order by status;

select id, status, attempt_count, next_attempt_at, last_error_code, updated_at
from summary_jobs
where status in ('pending', 'failed', 'running')
order by updated_at limit 50;
```

`last_error_code` 与 `attempt_count` 指明是 provider、reducer 还是 worker 自身的问题；`next_attempt_at` 指明这一行何时会被重新领取。判读规则：

- `status='failed'` 且 `next_attempt_at` 在未来——正常退避中，`failSummaryJob` 设的是 `now() + 5s`，到期后 `listRunnableSummaryJobIds` 自动重新捞取。单次观察什么都不用做。但**没有重试上限**：`attempt_count` 只被 `claimSummaryJob` 递增，没有任何查询读它，因此同一个作业会每 5 秒无限重试。`attempt_count` 持续攀升说明根因未修复，要按 `last_error_code` 处理，而不是等待退避。
- `status='running'` 且 `updated_at` 在五分钟以内——作业正在跑，或刚被领取。`updated_at` 的初值来自列上的 `default now()`（作业入表时），之后只在领取、提交、失败/取消与 rebase 时写入，**运行期间不刷新**，因此它是一个静止且不断变老的时间戳，不能用来判断进度。正常作业在 `summaryJobBudgetMs`（`PROVIDER_TIMEOUT_MS + 30000`，默认 60 秒）内结束，远小于五分钟租约；worker 的 `statement_timeout` 为 30 秒，超出预算时日志会打印一次 pass 未完成的报告。
- `status='running'` 且 `updated_at` 超过 5 分钟——被杀死的 worker 留下的行。同一个查询里的五分钟租约就是收割器，它会重新选中该行并由 `claimSummaryJob` 的条件 `UPDATE` 原子领取。这是崩溃恢复的唯一机制，不需要人工干预。
- `status='cancelled'` 且 `next_attempt_at is null`——reducer 拒绝了 patch，或触发了预算/provider 拒绝，或 `base_revision_missing`（`claimSummaryJob` 发现 base revision 快照缺失，这是数据完整性信号而不是策略拒绝）。**这是取消，不是重试**：该 trace 显示 raw-only，并已发出 `summary.failed` 流事件。不得手工把它改回 `pending` 强推——绕过 reducer 就是让未经校验的 patch 进入 immutable revision。要重新生成语义图，走正常的新 summary command 路径。

动作顺序：停止异常 worker（`docker compose stop worker`）→ 修复根因（数据库可达性、provider 配置、镜像版本）→ 重启 worker，让 `next_attempt_at` 和五分钟租约自行驱动重新领取。**禁止通过删除或改写 `summary_jobs` 行来「对齐」状态**：`(trace_id, input_hash)` 唯一索引和 `job_nonce` 是幂等身份，删掉它们会让同一份输入产生第二个 revision。也不要手工 `update` 把 `cancelled` 改成 `pending`。

其中有一种改写不可恢复，必须单独点名：**禁止把已经存在对应 `semantic_revisions.source_job_id` 的作业行改回任何可领取状态**（`pending`，或直接改成 `running` 并回退 `updated_at`）。这类行再也无法离开 `running`：`commitSummaryJob` 在 `packages/db/src/repository.ts:952-955` 先查 `semantic_revisions where source_job_id = jobId`，命中就直接返回既有 revision id，跳过 `:1044-1047` 的 `status='committed'` 写入；于是行永远停在 `running`，五分钟租约每个周期把它重新领取回同一个提前返回，`claimSummaryJob` 每次把 `attempt_count` 加一且没有任何重试上限。在 `openai`/`deepseek` 模式下，每个周期还会烧掉一次已计费的 provider 调用。没有任何自愈路径，只能人工把该行改回 `committed`。要重新生成语义图，走正常的新 summary command 路径。

恢复证据：`pending` 行的最大年龄回落；每个 committed 作业对应恰好一个 revision（`select count(*) from summary_jobs where status='committed'` 与 `select count(*) from semantic_revisions where source_job_id is not null` 相等——trace 建立时的初始 live revision 与 human edit revision 都没有 `source_job_id`，不计入）；不存在 `updated_at` 超过五分钟的 `running` 行；raw event 页面在整个过程中始终可用——PostgreSQL 已入库的 raw fact 不依赖 worker。记录失败 code、`attempt_count` 与 input hash，不记录敏感正文。

## Runbook：Datastore failure

PostgreSQL readiness 失败时 API 返回 degraded/503 并停止接收写入；不得缓存 raw event 到不可靠内存后返回成功。PostgreSQL 同时是唯一的作业分发来源，因此它不可用时 summary 作业只是停止被领取，恢复后按 `next_attempt_at` 与五分钟 `running` 租约自行续跑；ArtifactStore 失败时 metadata/payload transaction 不得留下成功假象。

检查磁盘、volume、容器 health、连接数与 migration，不执行未审阅的修复 SQL。若数据损坏，停止服务、复制故障卷、按 backup-restore 在新 volume 恢复；不要覆盖最后可恢复副本。

恢复后执行 migration no-op、hash/count/revision integrity、health 与目标 trace 查询。说明哪些证据是自动检查、哪些是人工环境验证。

## Runbook：SSE recovery

客户端断线后携带最后已应用 outbox ID 重连；服务从下一 ID 补发。客户端必须单调去重并在 gap 时停止应用临时状态，不能猜测丢失 semantic commit。

若 cursor 尚在 retention，验证补发连续并回到 live；若已过期，服务返回 `410 cursor_expired`，客户端重新获取 snapshot/cursor。服务器 heartbeat 不生成业务 ID；未验证 provider 输出不能进入补发流。

故障演练应覆盖网络断开、服务重启、重复 frame、gap、过期 cursor、trace A cursor 用于 trace B。记录最终 revision/watermark 与快照一致性。
