---
status: accepted
owner: security
last_reviewed: 2026-08-03
normative: true
milestone: Gate 5
---

# Retention 与删除

MVP 不自动过期 trace、outbox 或失败 job，默认由本地 operator 决定保留期；provider request/response 正文不落库，只有 hash、token/cost 和 redaction report。自动 retention 留到有稳定容量数据之后，避免静默丢失 replay cursor。

`DELETE /api/v1/traces/:traceId?confirm=:traceId` 要求精确 ID 确认；repository 在单事务中按 FK 顺序删除 feedback/provider audit/jobs/evidence/membership/versions/outbox/revisions/artifacts/raw/agents/trace，再调用 `ArtifactStore.deleteTrace` 清理 volume。若 volume 清理失败，数据库删除已完成且会留下可识别 orphan 文件；operator 按 runbook 重试。

备份是延迟删除副本；文档化的 backup expiry 到期前不能声称物理彻底删除。任何真实用户数据进入测试 fixture 前必须匿名化并人工审阅。
