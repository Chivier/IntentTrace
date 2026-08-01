---
status: accepted
owner: quality
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# 测试策略

Unit 测纯函数/config/path/storage；contract 测 Zod、adapter、ingest、reducer、DB schema 与生成 drift；integration 用真实 PostgreSQL/Redis/ArtifactStore 验证事务和崩溃重投；E2E 只验证已实现 UI/API；property test 探索 operation 序列；性能按独立 methodology。

Gate 0 E2E 只断言真实 status/health，不操作历史 prototype。Gate 1 强制四 adapter 匿名 fixtures 与 2,000+ event acceptance fixture。Gate 2 加 SSE gap/cursor、raw-only degraded。Gate 3 加 golden chunks/patches/graph、恶意 patch。Gate 4 加 egress/redaction/provider outage。Gate 5 加 restore、fault injection、a11y/performance。

每个测试结果必须记录环境与命令。静态 schema 检查不等于 migration 执行，mock provider 不等于云调用，合成 fixture 不等于现实准确率。
