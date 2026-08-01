---
status: draft
owner: operations
last_reviewed: 2026-08-01
normative: true
milestone: Gate 5
---

# 备份与恢复

一致备份包含 PostgreSQL dump/physical snapshot、artifact volume 和 manifest（commit、migration、image digest、每 trace artifact hash）。Redis/AOF 可不作为权威备份，但恢复后需从 DB commands/outbox 重建投递。

演练：停止写入或取得一致 watermark → 备份 DB/artifact → 在空目录启动锁定版本 → restore DB → restore artifacts → migrate no-op → 校验 row counts/hash/revision memberships → 启动服务 → raw/status/SSE smoke。原环境保留到校验完成。

Gate 0 只有设计，尚无环境验证；在真实 backup/restore 自动化与故障演练通过前 release readiness 为 blocked。备份文件按 trace 同等敏感处理。
