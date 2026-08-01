---
status: accepted
owner: architecture
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# ADR 0008：pnpm TypeScript monorepo

决定：用 pnpm workspace + Turbo 管理 Next web、Fastify API、BullMQ worker、Collector 和共享 packages。版本精确锁定，CI frozen lockfile。边界包分别承载 schema、config、db、storage、ingest、adapter、summarizer、reducer、layout、UI 与 fixtures，禁止跨层复制契约。
