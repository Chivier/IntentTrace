---
status: accepted
owner: operations
last_reviewed: 2026-08-10
normative: true
milestone: post-Gate 5 runtime slimming
---

# Runbook：Summary 作业队列

没有外部队列。分发只有一张表 `summary_jobs`，由 worker 每 2 秒（`SUMMARY_POLL_INTERVAL_MS`）轮询、串行处理，并发为 1。排障对象就是这张表，见 [ADR 0014](../../architecture/adr/0014-postgres-only-job-dispatch.md)。

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
