---
status: accepted
owner: architecture
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# ADR 0004：确定性 reducer

决定：provider 仅提交带 schema version、nonce、base revision、tmp refs 和显式 operation 的 patch。Reducer 校验 schema、allowlist、evidence、artifact/agent refs、cycle、status、dedupe、pin、方向和 confidence 后提交。相同输入必须产生相同结果；坏输出不得以 proposed node 泄露到正式图。
