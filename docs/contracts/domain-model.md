---
status: accepted
owner: data-contracts
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# 领域模型

`RawTraceEvent` 是 `schemaVersion` 版本化 envelope：server event ID、workspace/project/trace、source kind/session/event ID、adapter name/version、source time、server `ingestSeq`、agent/span/parent lineage、event kind、状态、payload hash/ref、artifact refs。数据库不得内联完整 raw payload。

EIG 的 `SemanticNode` 分 `request|goal|work|decision|issue|handoff|result`，状态为 `proposed|active|blocked|completed|abandoned|superseded`；正式已提交图不接收 provider 的 proposed 可见状态。每个 node version 有 intent/action/outcome claim，它们分别引用 evidence。Edge 有独立 logical/version ID、方向、kind 和 evidence。

`suggestedConfidence` 只存在于 provider patch；canonical claim 的 `confidence` 是 reducer 按证据规则得到的 `high|medium|low`。`stated|inferred|mixed` 表示 provenance，不表示概率。
