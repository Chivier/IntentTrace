---
status: accepted
owner: program
last_reviewed: 2026-08-03
normative: true
milestone: Gate 0-Gate 5
---

# 完整施工计划

## 施工原则

每个 Gate 都以“契约/ADR → implementation → automated evidence → target-environment evidence → progress/release gate”闭环。前一 Gate 失败不进入后一 Gate；raw correctness 与 semantic quality 分开；fixture/mock 与真实 provider/环境分开。

## Gate 0：工程与设计基线

产物：private pnpm monorepo、精确版本/lockfile、web 状态页、API health/readiness/version、非消费 worker、非读取 Collector、schema/reducer/storage contracts、完整 Drizzle schema/migration、loopback Compose、CI、历史 source lock 与本 docs。验收是根目录列出的 frozen install/format/lint/typecheck/test/contract/e2e/build/docs/schema/Compose/migrate×2，以及容器 health。只有全绿才创建本地初始化 commit。

## Gate 1：Raw ingestion

先实现 ArtifactStore transaction choreography 与 trace `ingestSeq` repository，再做 canonical JSONL/OTLP/Codex/Claude adapters，最后做 Collector import/follow/checkpoint。每 adapter 三份匿名 fixture，未知 version fail-visible。构造固定 seed 6-agent/2,000+ event fixture，覆盖重复、乱序、迟到、malformed、failure/repair/handoff/join/final。OTLP 验证 gzip、标准 ID/64-bit 与 partial-success；gRPC 不施工。

退出：重复相同 payload 返回同 ID；collision 409；rotation/truncation 无丢失/越界；payload 只存 hash/ref；真实用户 session 未进入测试。

## Gate 2：Raw UI、SSE 与 replay

实现 trace/project REST snapshot、raw event pagination、artifact range、Agent Gantt、Evidence Inspector 的 raw 部分、持久 outbox SSE 与 replay watermark。Web 先快照后流，断线补发/gap/expired cursor 明确处理。关闭 worker、Redis 或 provider 时，已入库 raw trace 仍能由 PostgreSQL/API 查询；Redis 恢复后从 DB 重建投递。

退出：状态页升级为真实 trace list/raw viewer；source time 只影响 Gantt；10k raw 基础查询有可重复测量；a11y 基础通过。

## Gate 3：Mock semantic pipeline

按顺序施工 immutable revision repository → 完整 reducer rules/property tests → deterministic sketch/chunker → mock provider → revision/outbox worker → React Flow/ELK web worker → Graph/Gantt/Evidence/replay 联动。Pending 只发布 `semantic_chunk.pending` ghost；commit 后才显示 canonical node。Pinned layout/fields 优先，局部更新不重排无关分支。

退出：同 fixture 稳定生成 chunks/patches/golden graph；崩溃重投只有一个 revision；恶意 patch 全拒绝；live/final/stale/late event 测试通过；键盘/reduced motion/200% zoom 达标。

## Gate 4：安全门与真实 provider

实现字段分类/redaction、event sketch egress report、provider registry/budget/audit、OpenAI Responses Structured Output adapter 与 DeepSeek JSON-mode adapter；所有输出继续本地 schema/reducer。真实调用需用户显式配置；不默认 fallback。对文档/代码/tool result 做 prompt injection，UI 做 stored XSS，日志/egress 做 secret canary。

退出：mock 永久全绿；provider outage/429/timeout/bad JSON 均 raw-only；模型 snapshot/价格日期可审计；无 canary 泄漏。付费/真实环境验证单独记录，不能由 mock 代替。

## Gate 5：发布加固

实现 final/human revision、edit/pin/feedback、成本视图、retention/delete、backup/restore、故障注入、性能与无障碍。建立一条命令 demo、锁定 images、升级/恢复演练和 release notes。明确 single-host/no HA；macOS/Windows 在专门验证前仍 unsupported。

退出：强制 acceptance matrix 全有证据；10k raw/1.5k nodes 性能预算通过；备份恢复 hash/count/revision 一致；clean checkout 一键启动；release readiness 无 open blocker。

## 关键依赖顺序

数据库事务/ID → adapters/Collector → raw query/UI → outbox/replay → revision/reducer → mock semantic/layout → egress security → real providers → release hardening。任何 UI 不能领先契约制造假状态，任何 provider 不能领先安全门。

## 2026-08-03 施工结果

- Gate 0：已完成并提交原始基线。
- Gate 1：四 adapter、Collector import/follow、artifact、幂等与 2,048-event fixture 已实现并在 Docker 路径执行。
- Gate 2：trace/raw/Gantt/replay/artifact/SSE 已实现；停 Redis/worker 时 raw query 仍为 200。
- Gate 3：revision/reducer/mock/BullMQ/React Flow/ELK worker/human evidence 已实现；并发导入暴露的 stale-base 问题经 transaction rebase 修复。
- Gate 4：真实 adapter、安全门、redaction、allowlist、budget audit 与 raw-only failure 已实现；无 key 的本轮没有真实付费 canary。
- Gate 5：human revision、删除、backup/restore、synthetic scale、a11y baseline 和 one-command demo 已实现；稳定 DB/UI 性能 SLA 未建立。
- macOS：Tauri 源码、服务归档、动态端口启动和 universal DMG workflow 已完成；Linux 不能生成/签名/公证 DMG。
