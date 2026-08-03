---
status: current
owner: program
last_reviewed: 2026-08-03
normative: true
milestone: Gate 5
---

# 实施进度

证据日期 2026-08-03；workspace `/home/chivier/Projects/IntentTrace`；Linux x86_64 host Node `24.14.0`，锁定构建容器 Node `24.18.0`、pnpm `11.18.0`。以下严格区分 authored/automated/environment/external。

## Planned

- 取得用户授权的测试 key 后做 OpenAI/DeepSeek canary、usage/cost 与 raw-only 故障验证。
- 在 macOS 12+ + Docker Desktop 上构建 universal DMG，并用 Apple Developer 身份 codesign/notarize/安装演练。
- 建立多轮 DB/query/SSE/ELK/browser 原始 benchmark，才能设置性能 SLA。

## Implemented

- Gate 1：canonical JSONL、OTLP HTTP JSON/gzip、Codex、Claude adapters；未知版本 fail-visible；显式 path Collector import/follow；realpath/file identity/offset/prefix-hash checkpoint；filesystem ArtifactStore；事务内单调 `ingestSeq`、source identity 幂等/409。
- Gate 2：trace list/detail、raw pagination、snapshot、Agent Gantt、artifact range、durable outbox SSE、`Last-Event-ID`/cursor/`resync.required`、ingest watermark replay；Web 是唯一动态 loopback 入口。
- Gate 3：immutable semantic revision/membership、claim evidence、deterministic reducer confidence/cycle/dedupe/pin rules、deterministic mock provider、BullMQ at-least-once dispatch + PostgreSQL claim/commit authority、React Flow/ELK worker/Graph-Gantt-Evidence linkage。
- Gate 4：secret redaction、untrusted-trace prompt boundary、provider event cap/timeout/domain allowlist/positive budget/audit、OpenAI Responses Structured Outputs、DeepSeek JSON mode、本地 Zod/reducer、no cross-provider fallback 和 raw-only failure。
- Gate 5：human edit/pin/feedback revision、provider-call audit API、confirmed trace deletion、backup/restore scripts、10k/1.5k synthetic smoke、keyboard/200%/reduced-motion browser baseline、`demo:load`。
- macOS：Tauri 2 launcher、hard-coded Rust Docker CLI boundary、embedded filtered stack archive、dynamic loopback discovery、universal DMG GitHub workflow。

## Automated verified

- Adapter/parser、Collector import/follow/rotation/truncation、config/security、storage/ingest、reducer property、ELK stability、provider redaction/Structured Outputs/JSON-mode validation、API payload ordering/OTLP gzip、schema/OpenAPI/Drizzle contracts均有 tests。
- `pnpm performance:smoke`：10,000 raw fixture 与 1,500-node reducer correctness smoke；最终复跑约 `11.29ms` / `4.18ms`，仅为 synthetic algorithm smoke，不是 DB/UI SLA。
- Required suite 全绿：format、lint；typecheck `26/26` tasks；unit `17 files / 43 tests`；contract `6 files / 11 tests`；Playwright `3/3`；build `16/16` tasks；docs `62` normative files；JSON Schema/OpenAPI/Drizzle drift 通过。
- `pnpm audit --prod` 为 `No known vulnerabilities found`；Next `16.2.12` 的受漏洞影响传递依赖通过精确 override 固定到 `postcss 8.5.25`、`sharp 0.35.0`，并完成 build/E2E 回归。
- `pnpm licenses list --prod` 已人工复核；没有 AGPL，`elkjs` 采用其 EPL-2.0 选项，Sharp 的预编译 libvips 为 LGPL-3.0-or-later。任何对外 DMG 发布仍需随发布产物完成第三方 notices/compliance 审核。

## Environment verified

- `docker compose up -d --build` 成功；最后一次重建的动态入口为 `127.0.0.1:32769→3000`，API/PostgreSQL/Redis internal-only；migration 首次和重复 no-op 均成功。该端口不是配置常量，重建后必须重新执行 `pnpm docker:url`。
- Collector 通过 Web 入口导入 1-event canonical fixture，mock worker 提交 evidence-backed live revision。
- `pnpm demo:load` 导入固定 seed 六 Agent 2,048 events；raw count 2,048；并发 stale-base job 缺陷被观测并修为 transaction rebase；修复后 43 jobs 全部 committed，最终 `final` revision watermark `2048`、42 semantic nodes。
- 完成后追加迟到 correction：首次 HTTP 201、相同内容重试 200/同 event ID、冲突内容 409；旧 final watermark `2048` 单向标为 stale，新 final watermark `2049` 提交，44 jobs 全部 committed。最终数据库计数为 2,050 raw facts、46 revisions；数据库实测拒绝 revision 内容更新和 `stale true → false`。
- 停止 Redis 和 worker 后，已入库 raw event query 返回 HTTP 200；readiness 正确返回 503；重启后 worker恢复。
- 干净 checkout 双栈验收发现固定 bridge name 会让不同 `-p` 项目共享 DNS alias；已改为 project-scoped default network，并由 `docker:check` 拒绝 fixed/external network reuse。
- backup manifest/hash/tar 校验并恢复到临时 PostgreSQL：2 traces、2,049 raw events、45 revisions；临时库随后删除。
- 未读取真实 Codex/Claude session，未配置 provider key，未发起付费模型调用。

## Deferred

- Auth/RBAC/multi-tenant、public SaaS、HA、Kubernetes、OTLP gRPC、graph DB、ClickHouse、Temporal、embedding、run comparison、移动端均仍不在 MVP。

## Blocked

- 可分发 macOS DMG：需要 macOS/Xcode、Apple certificate/account 和 notarization secrets；Linux 已通过 `pnpm desktop:check`，但只能验证 Tauri config、Rust formatting/dependency lock 与 stack archive。
- 真实 provider qualification：需要用户显式提供测试 key、model、预算并授权网络费用。
- 性能 release SLA：需要稳定硬件上的多轮 DB/UI 数据；当前 synthetic smoke 不足以宣称。
