---
status: accepted
owner: operations
last_reviewed: 2026-08-10
normative: true
milestone: Gate 5
---

# 备份与恢复

一致备份包含 PostgreSQL dump/physical snapshot、artifact volume 和 manifest（commit、migration、image digest、每 trace artifact hash）。没有需要单独备份的队列存储：作业分发状态就在 `summary_jobs` 里，随数据库一起恢复，未完成的作业按 `next_attempt_at` 与五分钟 `running` 租约自行被重新领取。

演练：停止写入或取得一致 watermark → 备份 DB/artifact → 在空目录启动锁定版本 → restore DB → restore artifacts → migrate no-op → 校验 row counts/hash/revision memberships → 启动服务 → raw/status/SSE smoke。原环境保留到校验完成。

`pnpm backup -- <directory>` 创建 PostgreSQL custom dump、artifact tar 和逐文件 SHA-256 manifest。`pnpm backup:verify -- <directory>` 校验 hash/tar，并恢复到临时隔离数据库核对 trace/raw/revision counts，最后删除临时库。2026-08-03 合成环境演练通过；它不等于用户真实磁盘故障恢复证据。备份文件按 trace 同等敏感处理。
