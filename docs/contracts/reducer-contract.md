---
status: accepted
owner: semantic-pipeline
last_reviewed: 2026-08-01
normative: true
milestone: Gate 3
---

# Reducer 契约

Patch 必须包含 `schemaVersion`、`jobNonce`、`baseRevisionId`、有序 operations 和 unresolved questions。新增实体用本 patch 唯一的 `tmp:<n>` 引用；其他 ID 必须属于 base revision 或 allowlist。Operation 是显式 `add_node|update_node|add_edge|retire_edge|supersede_node|suggest_merge`，不接受通用 JSON Patch。

Reducer 按固定顺序执行：schema/size → nonce/base/input hash → evidence/artifact/agent allowlist → temp ref 解析 → field operation → status transition → edge direction/self-edge/cycle → dedupe/merge → pin precedence → claim confidence → canonical sort/hash → transaction commit。任何失败都拒绝整个 patch。

数组只能 `replace|append_unique|remove`；nullable 字段用显式 `clear`，不得把缺失解释为清空。Human pinned title/parent/status/claim 优先于 provider；provider 不能 retire/supersede pinned entity。`depends_on`/`decomposes_to` 等方向写入 schema 映射并测试。重复相同 patch 返回既有 revision。

Evidence 规则：每个 add/update node 与 edge 至少一个允许 event；completion/result 必须包含 outcome evidence；只有显式通过测试、已创建 artifact、成功命令或直接结果才可得 high。模型建议最多降低审查优先级，不能提高最终等级。
