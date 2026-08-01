---
status: accepted
owner: database
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# Migration 策略

Drizzle schema 变更先执行 `pnpm db:generate`，审阅生成 SQL、锁类型、默认值、回滚/恢复影响，再提交 schema 与 migration。CI 运行 `drizzle-kit check`；发布路径在空 PostgreSQL 18.4 上 migrate 两次，第二次必须 no-op。

禁止在应用启动进程中隐式生成 migration。Compose 用一次性 `migrate` 服务，成功后 API/worker 才启动。生产化前的破坏性变更采用 expand → backfill → switch → contract；大表 backfill 必须可分批、可观测、可中断。

Migration 不承诺自动 down；恢复策略是先备份/验证 restore，再 rollout。已经在共享环境执行的 migration 不改写，修正必须增加下一 migration。
