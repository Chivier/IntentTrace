---
status: accepted
owner: architecture
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# ADR 0001：ETG 与 EIG 分层

决定：Execution Trace Graph 保存不可变观察事实；Evidence-backed Intent Graph 是可重建、可版本化、逐 claim 链回 ETG 的解释层。原因是可理解性不能污染保真数据。代价是双层存储与 revision 管理；收益是 provider 变化、人工修订和重新计算不会改写执行历史。
