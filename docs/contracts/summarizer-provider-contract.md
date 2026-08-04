---
status: accepted
owner: semantic-pipeline
last_reviewed: 2026-08-04
normative: true
milestone: Gate 3-Gate 4
---

# Summarizer Provider 契约

Provider 接收确定性 event sketch、root intent、active nodes、candidate parents、allowlisted event/artifact/agent IDs、locale、prompt version、job nonce 和 base revision。默认不发送源码正文、完整文档、完整终端日志或 secret；chunk input 先 canonical hash 以便缓存和审计。

每个 summary job 的 sketch 只包含 `(previous job watermark, current watermark]` 的确定性 chunk，不能反复发送整个 trace 前缀。Sketch 至少携带 event ID、kind、status、agent、可读 bounded name、content type 和该 event 的 allowlisted artifact IDs。永久 mock provider 必须优先选择 error、user/assistant message、tool result/call 等内容事件，避免 token count、mode、context 等遥测占据语义节点；final marker 可作为完成证据，但不能用 “Offline import complete” 取代实际 outcome 内容。

输出只能是 provider patch，随后本地完整 Zod 与 reducer 校验。Mock provider 永久可用且无网络。真实 provider 只有在 Gate 4 egress gate 开启后可选；registry 记录 provider、model/snapshot、能力、价格日期和 prompt version，业务逻辑不写死价格或“最新模型”。

Timeout、429、预算耗尽、bad JSON、schema/reducer 拒绝都产生结构化 provider call 结果并回退 raw-only；默认不跨 provider fallback。不得记录 key、Authorization header 或未 redacted prompt。
