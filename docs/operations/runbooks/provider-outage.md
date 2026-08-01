---
status: draft
owner: operations
last_reviewed: 2026-08-01
normative: true
milestone: Gate 4
---

# Runbook：Provider outage

症状：provider timeout/429/5xx、bad JSON、预算耗尽，summary job age 上升；raw ingest/query 正常。先确认 egress 是否被显式启用和 registry/model snapshot，检查仅含 hash/status 的审计，不打印 prompt/key。

处置：关闭真实 provider 或保持 raw-only；暂停相应 job 的重试，使用有上限退避；不切换到另一 provider；验证 API/raw UI 可用。恢复后只重放仍匹配 base revision/input hash 的 job，过期 job 重新 chunk。

结束条件：错误率和 queue age 恢复，抽样 patch 通过 reducer，无 secret 日志。记录影响 trace、时间、provider/model 和成本；不称 ingestion 中断。
