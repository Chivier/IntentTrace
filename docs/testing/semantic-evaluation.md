---
status: draft
owner: research
last_reviewed: 2026-08-01
normative: true
milestone: Gate 3-Gate 5
---

# 语义评估

评估集按 claim 粒度人工标注 intent/action/outcome、evidence coverage、completion support、重复节点和关键 issue/repair 路径。先冻结匿名数据集与 rubric，再比较 mock/provider/prompt；不以原型百分比或单个漂亮截图作准确率证据。

核心指标：unsupported claim rate、evidence precision/recall、critical-path node recall、duplicate rate、status error、graph edit stability、raw compression ratio。分别报告 stated 与 inferred；人工分歧和置信区间保留。

真实 provider 结果必须记录 model snapshot、prompt/policy version、日期、预算与失败率。语义质量和 reducer 安全是两个独立 gate：schema 合法不代表总结正确。
