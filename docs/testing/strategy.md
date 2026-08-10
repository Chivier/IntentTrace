---
status: accepted
owner: quality
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0-Gate 5
---

# 测试策略

Unit 测纯函数/config/path/storage；contract 测 Zod、adapter、ingest、reducer、DB schema 与生成 drift；integration 用真实 PostgreSQL/ArtifactStore 验证事务和崩溃重投；E2E 只验证已实现 UI/API；property test 探索 operation 序列；性能按独立 methodology。

当前 suite 覆盖四 adapter/unknown version、Collector checkpoint、payload choreography、OTLP gzip、reducer confidence/cycle/pin/determinism、provider redaction/JSON validation、Graph/Gantt/Evidence/replay 的 browser baseline、restore 和 synthetic scale smoke。Docker 环境额外执行 2,048-event ingestion/semantic commit、migration×2 和 backup restore；outage 演练在两镜像栈上以 worker-only 形式执行过（2026-08-10：只 `docker compose stop worker`，2,048 raw events 分 3 页全部 HTTP 200，`/readyz` 返回 200 `{postgres:"ok"}`——PostgreSQL 是唯一被探测的依赖，worker 不构成就绪维度；重启后积压 job 恢复处理），移除 Redis 前的三镜像栈演练则是同时停 Redis 与 worker、readiness 为 503。

每个测试结果必须记录环境与命令。静态 schema 检查不等于 migration 执行，mock provider 不等于云调用，合成 fixture 不等于现实准确率。
