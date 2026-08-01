---
status: draft
owner: operations
last_reviewed: 2026-08-01
normative: true
milestone: Gate 2
---

# Runbook：SSE recovery

客户端断线后携带最后已应用 outbox ID 重连；服务从下一 ID 补发。客户端必须单调去重并在 gap 时停止应用临时状态，不能猜测丢失 semantic commit。

若 cursor 尚在 retention，验证补发连续并回到 live；若已过期，服务返回 `410 cursor_expired`，客户端重新获取 snapshot/cursor。服务器 heartbeat 不生成业务 ID；未验证 provider 输出不能进入补发流。

故障演练应覆盖网络断开、服务重启、重复 frame、gap、过期 cursor、trace A cursor 用于 trace B。记录最终 revision/watermark 与快照一致性。
