---
status: current
owner: quality
last_reviewed: 2026-08-10
normative: true
milestone: Gate 1-Gate 5
---

# 强制验收矩阵

| 场景                            | 状态                       | 证据                                                                                                                                                                                                                                           |
| ------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 重复/乱序/迟到 event            | automated + environment    | ingest tests；late final Docker drill；monotonic DB sequence                                                                                                                                                                                   |
| file append/rotation/truncation | automated                  | `apps/collector/tests/collector.test.ts`                                                                                                                                                                                                       |
| worker 崩溃与重投               | environment                | 2,048-event concurrent stale-job rebase；DB source-job idempotency                                                                                                                                                                             |
| 恶意 patch/prompt injection     | automated                  | reducer property tests；summarizer provider safety tests                                                                                                                                                                                       |
| SSE gap/过期 cursor             | implemented + environment  | outbox cursor/Last-Event-ID；expired cursor emits `resync.required`                                                                                                                                                                            |
| worker/provider outage          | environment + automated    | 两镜像栈只停 worker（2026-08-10）：2,048 raw events 分 3 页全部 HTTP 200、`/readyz` 200 `{postgres:"ok"}`、重启后 2 个积压 job 3 秒内 committed；移除 Redis 前的三镜像栈同时停 Redis 与 worker 时 readiness 为 503；provider failure unit path |
| secret/stored XSS               | automated                  | redaction tests；Playwright escaped payload；artifact attachment/CSP                                                                                                                                                                           |
| backup restore                  | environment                | isolated `pg_restore`, hash/tar/count drill                                                                                                                                                                                                    |
| 10k raw / 1.5k nodes            | synthetic smoke only       | `pnpm performance:smoke`;不是 DB/UI SLA                                                                                                                                                                                                        |
| keyboard/200%/reduced motion    | automated browser baseline | `tests/e2e/workbench.spec.ts`                                                                                                                                                                                                                  |
| 浏览器会话导入                  | automated + environment    | `apps/api/src/import-routes.test.ts`；`tests/e2e/import.spec.ts`                                                                                                                                                                               |

真实 provider canary、真实 macOS DMG 安装/签名/公证和长期 DB/UI 性能仍分别列在 release blockers；不能由上述 mock/synthetic 证据替代。
