---
status: current
owner: maintainers
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0-Gate 5
---

# 测试

本文覆盖分层测试策略、验收 fixture 与强制验收矩阵、reducer property test、语义评估方法与性能方法。各节的非声明（non-claim）互不替代：mock、合成 fixture、静态检查与真实环境证据分别只证明自己那一层。

## 测试策略

Unit 测纯函数/config/path/storage；contract 测 Zod、adapter、ingest、reducer、DB schema 与生成 drift；integration 用真实 PostgreSQL/ArtifactStore 验证事务和崩溃重投；E2E 只验证已实现 UI/API；property test 探索 operation 序列；性能按独立 methodology。

当前 suite 覆盖四 adapter/unknown version、Collector checkpoint、payload choreography、OTLP gzip、reducer confidence/cycle/pin/determinism、provider redaction/JSON validation、Graph/Gantt/Evidence/replay 的 browser baseline、restore 和 synthetic scale smoke。Docker 环境额外执行 2,048-event ingestion/semantic commit、migration×2 和 backup restore；outage 演练在两镜像栈上以 worker-only 形式执行过（2026-08-10：只 `docker compose stop worker`，2,048 raw events 分 3 页全部 HTTP 200，`/readyz` 返回 200 `{postgres:"ok"}`——PostgreSQL 是唯一被探测的依赖，worker 不构成就绪维度；重启后积压 job 恢复处理），移除 Redis 前的三镜像栈演练则是同时停 Redis 与 worker、readiness 为 503。

每个测试结果必须记录环境与命令。静态 schema 检查不等于 migration 执行，mock provider 不等于云调用，合成 fixture 不等于现实准确率。

## 验收 Fixture

固定 seed 的 fixture 最少 2,000 raw events、6 agents：1 orchestrator + research/backend/frontend/summarization/testing 五 specialist。故事必须含用户目标、并行分解、handoff、join、一次 malformed ID 导致失败、可观察修复、测试重跑和 final result。

每条事件有 stable source identity、source/source-ingest time、lineage、payload hash/ref；包含重复、乱序、迟到、缺省可选字段与 rotation 边界。Golden manifest 记录 generator version、seed、event count、agent count、文件 hash，不提交真实 session 或 secret。

`generateAcceptanceFixture(2048)` 已实现固定 seed、六 Agent、并行 lane、handoff、failure/repair、malformed ID observation、join 和 final marker；`pnpm demo:load` 通过实际 Web→API 路径导入。四 adapter 各有三份匿名 fixture。当前 generator 的重复/迟到变体由 repository/环境场景另测，不把合成故事当作真实 semantic quality 证据。

## 强制验收矩阵

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

## Reducer Property Tests

_来源文档状态为 `draft`。_

生成合法 base graph、allowlist 与 operation 序列，验证：相同输入 canonical hash/结果一致；拒绝结果不写部分实体；所有 membership 指向同 trace version；无非法 cycle/self-edge；pinned fields 不被 provider 改写；tmp refs 只在本 patch；evidence 全在 allowlist。

Metamorphic cases：无关 operation 排序在 canonicalization 后等价；重复 `append_unique` 幂等；add 后 update 等价于 canonical add；过期 base 一律 conflict；任意字符串/数组边界不会造成未捕获异常。失败 seed 必须保存为匿名 regression fixture。

Property tests 补充而不替代具体规则示例和数据库 transaction integration。

## 语义评估

_来源文档状态为 `draft`。_

评估集按 claim 粒度人工标注 intent/action/outcome、evidence coverage、completion support、重复节点和关键 issue/repair 路径。先冻结匿名数据集与 rubric，再比较 mock/provider/prompt；不以原型百分比或单个漂亮截图作准确率证据。

核心指标：unsupported claim rate、evidence precision/recall、critical-path node recall、duplicate rate、status error、graph edit stability、raw compression ratio。分别报告 stated 与 inferred；人工分歧和置信区间保留。

真实 provider 结果必须记录 model snapshot、prompt/policy version、日期、预算与失败率。语义质量和 reducer 安全是两个独立 gate：schema 合法不代表总结正确。

## 性能方法

基准环境固定 CPU/RAM/disk、Linux、Node、PostgreSQL image digest、commit 与冷/热缓存。数据集至少 10,000 raw events 和 1,500 semantic nodes，另含 2,000-event acceptance fixture。

测量 ingest events/s 与 p50/p95/p99、snapshot/query、SSE backlog catch-up、revision commit、artifact range、Graph layout 与交互帧。Provider latency/cost 单独报告，不混入 deterministic pipeline。每项预热后多次运行，保存原始 JSON 和命令。

`pnpm performance:smoke` 是固定 10,000 raw / 1,500 node 的内存生成与 reducer correctness smoke，输出明确标为 `synthetic_smoke_not_ui_sla`。2026-08-03 本机单次约 10.14ms/4.03ms，只证明算法没有明显数量级回归。DB ingest/query、ELK 1,500-node 和浏览器帧率尚无稳定多轮原始数据，因此发布声明不得写成完成性能 SLA。
