---
status: draft
owner: quality
last_reviewed: 2026-08-01
normative: true
milestone: Gate 1
---

# 验收 Fixture

固定 seed 的 fixture 最少 2,000 raw events、6 agents：1 orchestrator + research/backend/frontend/summarization/testing 五 specialist。故事必须含用户目标、并行分解、handoff、join、一次 malformed ID 导致失败、可观察修复、测试重跑和 final result。

每条事件有 stable source identity、source/source-ingest time、lineage、payload hash/ref；包含重复、乱序、迟到、缺省可选字段与 rotation 边界。Golden manifest 记录 generator version、seed、event count、agent count、文件 hash，不提交真实 session 或 secret。

Gate 0 只提交 manifest contract 和极小 foundation event，明确标记大 fixture 未实现；禁止用 1-event 示例宣称 acceptance 通过。
