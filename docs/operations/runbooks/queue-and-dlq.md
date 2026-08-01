---
status: draft
owner: operations
last_reviewed: 2026-08-01
normative: true
milestone: Gate 3
---

# Runbook：Queue 与 DLQ

症状：Redis 不可达、queue age/attempt 上升、worker crash loop、DLQ 增长。先看 PostgreSQL summary job 状态与 input hash，再看 Redis；BullMQ 不是权威，禁止通过清 DB “对齐”。

处置：停止异常 worker，修复 Redis/配置，按 DB pending/running lease 重建投递。达到重试上限的 job 标 failed/DLQ 并显示 raw-only；验证重复投递只产生一个 revision/outbox。坏 patch 不因手工 retry 绕过 reducer。

恢复证据：pending age 降低、job→revision 一一对应、无 orphan running、raw 页面全程可用。保留失败 code 和 hash，不保留敏感正文。
