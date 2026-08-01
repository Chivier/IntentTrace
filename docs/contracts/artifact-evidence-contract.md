---
status: accepted
owner: storage
last_reviewed: 2026-08-01
normative: true
milestone: Gate 1
---

# Artifact 与 Evidence 契约

Artifact 以 `(traceId, sha256)` 内容寻址，metadata 记录 byte length、media type、创建时间和可选 redaction state。`put` 必须先计算 hash、原子落盘；`stat` 不返回内容；`getRange` 只读明确范围；`deleteTrace` 删除该 trace 名空间。路径不能由用户输入拼接。

Evidence 是 claim 到 raw event/artifact 的关系，记录 evidence kind 与可选 range。Intent、action、outcome 分别建立 claim，不能用同一个“node confidence”掩盖证据差异。UI 展示摘要默认转义；源码、终端、HTML 都按 untrusted content 处理，下载与内联渲染有独立 media policy。

删除 trace 时先阻止新写入，再删除数据库 membership/evidence/metadata 与 artifact namespace，最后写本地 audit 结果；备份中删除遵循 retention 文档，不承诺即时物理抹除。
