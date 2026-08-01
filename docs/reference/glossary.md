---
status: current
owner: product
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# Glossary

- **ETG (Execution Trace Graph)**：不可变 raw execution facts 与 lineage。
- **EIG (Evidence-backed Intent Graph)**：从 ETG 派生、可版本化并逐 claim 证据支撑的语义图。
- **RawTraceEvent**：规范化、版本化的事实 envelope；正文以 hash/ref 保存。
- **logical ID / version ID**：跨 revision 稳定身份 / 单次 immutable 内容版本。
- **revision**：在一个 event watermark 上的 node/edge membership 快照。
- **watermark**：该视图已纳入的最大 `ingestSeq`；不是 source time。
- **event sketch**：机械压缩、redacted、面向 provider 的最小输入。
- **patch**：provider 提议的显式 graph operations；不是已提交语义。
- **reducer**：确定性验证、canonicalize 并 transaction commit patch 的组件。
- **evidence**：claim 到 raw event/artifact 的可审计引用。
- **ghost state**：chunk pending 的确定性 UI 状态，不含未验证模型输出。
- **ArtifactStore**：`put/stat/getRange/deleteTrace` 的大对象边界。
- **source identity**：adapter 来源中用于幂等的 session/event 组合。
- **outbox**：与业务写入同事务持久化、用于 SSE/queue 发布的事件记录。
- **raw-only**：semantic pipeline 不可用时仍能浏览已入库事实的降级模式。
