---
status: draft
owner: security
last_reviewed: 2026-08-01
normative: true
milestone: Gate 5
---

# Retention 与删除

Gate 0 不自动过期 trace。默认本地 operator 决定保留期；provider request/response 正文不落库，只有 hash、token/cost 和 redaction report。SSE outbox、idempotency record 与失败 job 的具体 retention 在 Gate 2/5 压测后确定。

`delete trace` 施工顺序：进入 deleting 状态并停止 ingest → 验证无运行 job → 删除 feedback/evidence/membership/versions/jobs/outbox/raw metadata → `ArtifactStore.deleteTrace` → 删除 trace → 写不含内容的本地 audit。失败必须可重试并显示残留范围。

备份是延迟删除副本；文档化的 backup expiry 到期前不能声称物理彻底删除。任何真实用户数据进入测试 fixture 前必须匿名化并人工审阅。
