---
status: draft
owner: operations
last_reviewed: 2026-08-10
normative: true
milestone: Gate 5
---

# Runbook：Datastore failure

PostgreSQL readiness 失败时 API 返回 degraded/503 并停止接收写入；不得缓存 raw event 到不可靠内存后返回成功。PostgreSQL 同时是唯一的作业分发来源，因此它不可用时 summary 作业只是停止被领取，恢复后按 `next_attempt_at` 与五分钟 `running` 租约自行续跑；ArtifactStore 失败时 metadata/payload transaction 不得留下成功假象。

检查磁盘、volume、容器 health、连接数与 migration，不执行未审阅的修复 SQL。若数据损坏，停止服务、复制故障卷、按 backup-restore 在新 volume 恢复；不要覆盖最后可恢复副本。

恢复后执行 migration no-op、hash/count/revision integrity、health 与目标 trace 查询。说明哪些证据是自动检查、哪些是人工环境验证。
