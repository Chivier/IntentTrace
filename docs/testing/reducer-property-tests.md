---
status: draft
owner: semantic-pipeline
last_reviewed: 2026-08-01
normative: true
milestone: Gate 3
---

# Reducer Property Tests

生成合法 base graph、allowlist 与 operation 序列，验证：相同输入 canonical hash/结果一致；拒绝结果不写部分实体；所有 membership 指向同 trace version；无非法 cycle/self-edge；pinned fields 不被 provider 改写；tmp refs 只在本 patch；evidence 全在 allowlist。

Metamorphic cases：无关 operation 排序在 canonicalization 后等价；重复 `append_unique` 幂等；add 后 update 等价于 canonical add；过期 base 一律 conflict；任意字符串/数组边界不会造成未捕获异常。失败 seed 必须保存为匿名 regression fixture。

Property tests 补充而不替代具体规则示例和数据库 transaction integration。
