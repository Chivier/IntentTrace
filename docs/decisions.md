---
status: current
owner: maintainers
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0-Gate 5 与 post-Gate 5
---

# 决策记录（ADR）

本文收录全部 14 条 ADR，逐条保留原文的决定文本与自身状态行；ADR 一旦 Accepted 就不再改写结论，替代关系由新 ADR 声明。文末的 [ADR 索引](#adr-索引) 给出按主题的快速导航与当前 supersede 关系。

## ADR 0001：ETG 与 EIG 分层

_状态：accepted · owner：architecture · last_reviewed：2026-08-01 · milestone：Gate 0_

决定：Execution Trace Graph 保存不可变观察事实；Evidence-backed Intent Graph 是可重建、可版本化、逐 claim 链回 ETG 的解释层。原因是可理解性不能污染保真数据。代价是双层存储与 revision 管理；收益是 provider 变化、人工修订和重新计算不会改写执行历史。

## ADR 0002：契约事实源

_状态：accepted · owner：architecture · last_reviewed：2026-08-01 · milestone：Gate 0_

决定：Zod 是领域/API schema 唯一源，Drizzle 与已提交 migration 是持久化事实源；JSON Schema/OpenAPI 必须由代码生成并通过 drift 检查。Accepted ADR 解释无法由类型表达的规则。历史 JSON Schema 不直接参与运行时校验，避免手写副本分叉。

## ADR 0003：不可变 revision 与 watermark

_状态：accepted · owner：architecture · last_reviewed：2026-08-01 · milestone：Gate 0_

决定：logical ID 与 version ID 分离；revision 保存 parent、`live|final|human` branch 和 event watermark，通过 membership 表复用版本。Replay 使用 ingest/revision commit watermark 表示当时已知，source time 只决定时间轴位置。迟到 event 使 final stale，并以新 final 纠正，不覆写历史。

## ADR 0004：确定性 reducer

_状态：accepted · owner：architecture · last_reviewed：2026-08-01 · milestone：Gate 0_

决定：provider 仅提交带 schema version、nonce、base revision、tmp refs 和显式 operation 的 patch。Reducer 校验 schema、allowlist、evidence、artifact/agent refs、cycle、status、dedupe、pin、方向和 confidence 后提交。相同输入必须产生相同结果；坏输出不得以 proposed node 泄露到正式图。

## ADR 0005：内容寻址 ArtifactStore

_状态：accepted · owner：architecture · last_reviewed：2026-08-01 · milestone：Gate 0_

决定：大对象使用 SHA-256 内容寻址，默认存在本地 named volume。公共接口固定 `put`、`stat`、`getRange`、`deleteTrace`，后续可加 S3 adapter。MinIO 因分发与维护状态不作为默认依赖。数据库只保留 hash、长度、media type 与 ref；删除以 trace 为隔离单位。

## ADR 0006：PostgreSQL 幂等与 outbox

_状态：accepted · owner：architecture · last_reviewed：2026-08-01 · milestone：Gate 0_

决定：BullMQ 按 at-least-once 使用，正确性由 PostgreSQL input hash、base revision 与唯一约束保证。raw insert/command、revision/job result、SSE event 分别与其业务写入同事务。Redis 丢失可以重建投递；数据库提交前不得 ack。

## ADR 0007：REST 快照与 durable SSE

_状态：accepted · owner：architecture · last_reviewed：2026-08-01 · milestone：Gate 0_

决定：MVP 用 `/api/v1` REST 读写和 SSE 增量，不引入 WebSocket。OTLP 保留标准 `POST /v1/traces`。SSE ID 来自持久 outbox，支持 `Last-Event-ID` 和 `?cursor=`；早于保留窗口的 cursor 先发 `resync.required` 再补最早可用事件。生成 OpenAPI只列真实 route。

## ADR 0008：pnpm TypeScript monorepo

_状态：accepted · owner：architecture · last_reviewed：2026-08-01 · milestone：Gate 0_

决定：用 pnpm workspace + Turbo 管理 Next web、Fastify API、BullMQ worker、Collector 和共享 packages。版本精确锁定，CI frozen lockfile。边界包分别承载 schema、config、db、storage、ingest、adapter、summarizer、reducer、layout、UI 与 fixtures，禁止跨层复制契约。

## ADR 0009：本地单用户与 loopback

_状态：accepted · owner：security · last_reviewed：2026-08-03 · milestone：Gate 0_

决定：首发无 auth/RBAC/tenant。默认 Compose 仅将 Web 发布到 Docker 自动分配的 `127.0.0.1` 端口；API、PostgreSQL 与 Redis 只在私有 bridge 内可达。显式固定 Web 端口仍只能绑定 loopback。这是部署边界，不等于输入可信：仍需 XSS、路径、prompt injection 和 secret redaction 防护。任何公网或 LAN 暴露都必须先新增认证、CSRF/CORS、租户隔离和威胁模型。

## ADR 0010：provider egress 安全门

_状态：accepted · owner：security · last_reviewed：2026-08-01 · milestone：Gate 0_

决定：默认强制 `PROVIDER_MODE=mock`、`PROVIDER_EGRESS_ENABLED=false`。真实 provider 只有 egress、allowlisted host、key、明确 model 和正预算同时满足才启用；发送前做 redaction/event cap，返回后做本地 schema/reducer。不自动 fallback；timeout、429、预算或坏 JSON 退化 raw-only，不阻塞 ingestion。

## ADR 0011：独立 Collector

_状态：superseded · owner：security · last_reviewed：2026-08-06 · milestone：Gate 0_

决定：API 不读取宿主机目录。Collector CLI 只处理 `--path` 显式授权，绝不扫描 home，默认拒绝 symlink 边界；checkpoint 记录 realpath、file identity、offset 和 prefix hash，以识别 append/rotation/truncation。实现对显式 file 或显式 directory 的一层 regular files 做 import；follow 只允许 Codex/Claude 单文件。

状态：独立 Collector、显式授权、API 不扫描宿主目录和 symlink 拒绝结论继续有效；“一层 regular files/直接 import”实现限制由 [`0012`](#adr-0012显式授权根内的两阶段会话导入) 的递归、两阶段 guided import 替代。

## ADR 0012：显式授权根内的两阶段会话导入

_状态：accepted · owner：ingestion · last_reviewed：2026-08-06 · milestone：post-Gate 5 import UX_

### 背景

ADR 0011 建立了不可突破的权限边界：API 不读取宿主目录，Collector 只处理操作者显式命名的 path。后续实际使用发现，仅把目录中的文件批量导入或用 `--dry-run` 列文件名不足以支持数百个 Codex/Claude session：操作者无法在发送 raw facts 前判断会话是否可读、属于哪个项目、何时活跃，也无法稳定选择少数会话。文件末尾损坏时，边解析边发送还可能留下半导入 trace。

对 Paseo 的 provider-session import 研究表明，成熟导入流程应拆成轻量 listing 与 selected import 两阶段，并以稳定 handle、bounded descriptor、失败隔离和明确 empty/error 状态连接 CLI/UI。详细来源与差异分析见 [`design/research/import-experience.md`](design/research/import-experience.md)。

### 决定

1. **权限边界不变**：API/worker/Web server 不扫描宿主文件系统；Collector 不自动读取 home。Collector 的 ingestion origin 在 local MVP 只允许 `localhost`、IPv4 `127.0.0.0/8` 或 IPv6 `::1`，防止误配置把 raw session 发往远端。每次 discovery/import 必须有操作者显式命名的 regular file 或 directory root，每层拒绝 symlink。
2. **两阶段协议**：
   - `discover` 在授权根内生成 versioned `SessionCatalog`，不联系 API、不写 checkpoint、不发送 raw facts；
   - `import --session <opaque-id>` 可重复指定 catalog ID，只导入被选择的 candidate，不以 native path/session ID 作为公开选择器，也不在 import 时重新执行内容搜索。
3. **catalog 最小披露**：默认 descriptor 只包含 opaque ID、source、generic title、project basename hint、activity/mtime、byte/event/warning counts；绝对路径、根内相对路径、文件名和 native session ID 不进入 stdout。只有 `--include-previews` 明确 opt-in 后才输出 bounded visible first/last prompt preview 与内容标题；hidden reasoning/thinking 永不进入 catalog。
4. **stale selection fail-visible**：opaque ID 绑定 source、授权 root、root-relative placement、size、mtime 和 file identity 的本地选择上下文。候选变化后旧 ID 不匹配，必须刷新 catalog；禁止旧 preview 静默指向变化后的文件。
5. **完整 preflight**：每个文件必须在发送第一条 raw fact 前完成 adapter parse、隐私 omission 和 Zod validation。 malformed/unsupported/visible-event-empty candidate 发送 0 events；同批其他文件继续。stat/realpath/race/越界 candidate 计入 `rejectedFiles` 并让命令非零退出，不能静默消失。API 在单文件发送过程中失败仍可能留下前缀 raw facts，这些是不可覆盖的已观察事实，重试依靠 source identity 幂等补齐。
6. **有界资源**：先以最多 32 并发读取 metadata，对全部 candidate 排序并裁剪 limit，再只检查 recent/selected window；discovery 只保留 descriptor，import 按 bounded concurrency 逐文件 preflight→send，内存上界由 concurrency 与单文件大小决定，不由目录总文件数决定。单文件默认上限 64 MiB，可用 `--max-file-mib` 显式调整，超限 candidate 在读取前失败。
7. **契约来源**：`SessionCatalogSchema`、`SessionImportOutcomeSchema` 与 `SessionImportSummarySchema` 位于 `packages/schema`，生成 JSON Schema；catalog、逐会话成功结果和聚合 summary 在写 stdout 前必须通过 schema。未来 Tauri/Web picker 只能消费该 catalog/progress 协议，不得绕过 Collector 让 API 扫目录。
8. **兼容性**：现有无 `--session` 批量 import、`--max-files`、`--newest`、`--concurrency`、`--dry-run` 和单文件 `follow` 保留。`dry-run` 升级为完整 preflight catalog，但默认不输出 prompt preview。

### 后果

优点：导入前可验证、可选择、可脚本化；坏文件不会产生 adapter-level 半导入；stdout 默认不泄露 home path/native ID/prompt；未来图形 picker 有稳定契约。代价：discovery 会读取并解析 limit 内候选，较纯 `stat` 慢；catalog ID 是本地授权根作用域内的短期 selector，不是持久 domain identity；单文件 API 发送仍不是跨事件原子事务。

ADR 0012 替代 ADR 0011 中“一层 regular files/只有直接 import”的实现限制，但不替代其独立 Collector、显式授权、API 不读宿主目录和 symlink 拒绝结论。

## ADR 0013：浏览器交付的会话上传

_状态：accepted · owner：ingestion · last_reviewed：2026-08-09 · milestone：post-Gate 5 import UX_

### 背景

ADR 0012 建立的两阶段 guided import 只有 CLI 入口。Web UI 的整个导入界面是 `/traces` 空状态里一段不可复制的 `<pre>` 命令清单，操作者必须离开浏览器、拼出授权根路径、再回来刷新。同时四个 adapter 中有三个只接受行分隔 JSONL，一份整文档 `.json` session 会以 `MalformedAdapterInputError` 被拒绝。

关键区分：**操作者在浏览器里显式选择并交出的字节，不是宿主目录扫描。** 文件选择器由用户代理拥有，网页只能拿到用户主动交出的 `File`。这条边界与 ADR 0012 §1 的"API 不扫描宿主文件系统"完全兼容。

### 决定

1. **权限边界不变**：API 仍然不枚举任何目录。新增的两条路由只处理请求体里已经到达的字节，不接受路径参数，不做任何文件系统读取。ADR 0012 §1 与 §7 继续成立；服务端目录选择器仍然被禁止。
2. **共享 preflight 核心**：`packages/adapters/src/session.ts` 的 `prepareSessionBytes` 是 CLI 与上传路径唯一的解析入口——先完整 parse + Zod validate，再由调用方发出第一条 raw fact。Collector 的 `prepareSession` 保留 fs 半边（size gate、`O_NOFOLLOW`、读前读后 identity/size/mtime 复核）后委托给它。
3. **同一 trace 身份**：`buildCompletionMarker` 由文件 SHA-256 而非传输方式派生 `trace_complete` 的 `sourceEventId`。CLI 导入过的文件在浏览器重传得到 `inserted: 0`、相同 `traceId`；反向亦然。两条路径互为幂等。
4. **预览是 opt-in**：`POST /api/v1/imports/candidates` 默认返回 generic title 与 `null` preview，只有 `includePreviews: true` 才返回内容标题和 bounded first/last prompt preview，上限 160 字符，与 catalog 的 `--include-previews` 同一实现（`redactCatalogEntry`）。hidden reasoning/thinking 永不进入 candidate。
5. **有界 head 检查**：候选检查只读每个文件前 64 KiB，单请求最多 50 个候选，不完整 head 在最后一个换行处截断。检查路由不写任何东西，只发一次数据库查询（`listTracesByIds`）判断是否已导入。
6. **上传上限是配置项**：`IMPORT_UPLOAD_MAX_BYTES` 默认 64 MiB，与 collector 的 `DEFAULT_MAX_FILE_MIB` 一致。超限由 Fastify 的 `FST_ERR_CTP_BODY_TOO_LARGE` 映射为 413 `payload_too_large`，媒体类型不符映射为 415 `unsupported_media_type`——这两个此前都会错误地变成 500。
7. **容器 JSON**：`readSessionRecords` 在既有 JSONL 解析之上追加顶层数组与单个 pretty-printed 对象两个分支。JSONL 输入走第一分支，`line`/`bytes` 逐字节不变，已导入 trace 的 fallback `sourceEventId` 因此保持稳定。只有此前会抛错的输入才会到达容器分支；仍然无法解析时重新抛出原始 `parseJsonLines` 错误，collector 的 `preflight_failed` 脱敏路径不受影响。
8. **文件名只用于 sourceIdentity**：`safeIdentifier(basename(fileName))` 与 collector 从磁盘 basename 派生的值相同，因此同一文件的浏览器导入和 CLI 导入落在同一 project。文件名不进入 descriptor，也不回显到 catalog 输出。

### 后果

优点：不装 CLI 也能导入；同一文件两条路径身份一致；413/415 变成真实语义；`.json` session 不再被拒。代价：上传字节在浏览器 `File`、Next `arrayBuffer()` 和 Fastify `Buffer` 三处完整驻留内存，这是 loopback 单用户 MVP 的可接受取舍，也是上限做成配置键而非常量的原因；head 检查对超过 64 KiB 且没有换行的整文档 JSON 会报 `preflight_failed`，但该候选仍可导入，因为上传路径在完整字节上重新检测。

本 ADR 不替代 ADR 0012；它在同一权限边界内新增一个由操作者交付字节的入口。

## ADR 0014：PostgreSQL 单源作业调度

_状态：accepted · owner：architecture · last_reviewed：2026-08-10 · milestone：post-Gate 5 runtime slimming_

### 背景

Gate 3 起，summary 作业的分发写成了「PostgreSQL 出队 → Redis 入队 → 同进程取回」的往返：`apps/worker/src/main.ts` 每 2 秒调用 `listRunnableSummaryJobIds()` 从 PostgreSQL 取出待办 ID，用 `queue.add()` 写进 Redis，再由同一进程内 `concurrency: 1` 的 BullMQ `Worker` 取回执行。队列两端都在同一个进程里。

复核这条链路时确认：**重试、退避与崩溃恢复完全不经过 BullMQ**。

- `failSummaryJob` 把作业置为 `status='failed'` 并设 `next_attempt_at = now() + 5s`；reducer 拒绝的 patch 与预算/provider 拒绝走 `retry=false`，置为 `status='cancelled'`、`next_attempt_at = null`，是取消而不是重试。
- `listRunnableSummaryJobIds` 的查询同时捞取 `next_attempt_at` 到期的 `pending`/`failed` 作业，以及 `status='running'` 且 `updated_at` 超过 5 分钟的作业——后者就是被杀死 worker 的收割器。`claimSummaryJob` 用同一组条件做带条件的原子 `UPDATE`，并递增 `attempt_count`。
- BullMQ 侧从未配置 `attempts`（默认 1 次），且 `removeOnComplete`/`removeOnFail` 均为 `true`，因此它既不重试也不保留死信。

换言之，队列层没有承担任何正确性或可用性职责，它只是把一个进程内的函数调用绕成了一次网络往返，代价是第三个运行时依赖、第三个 pinned 镜像与随之而来的第六个 Compose 服务、一个 native addon（经 `bullmq` → `msgpackr` 引入的 `msgpackr-extract`）、一个配置键、一个健康维度和一段威胁面。完整证据与实施范围见[运行时瘦身与队列移除设计](design/research/slim-runtime-and-queue-removal.md)。

### 决定

1. **PostgreSQL `summary_jobs` 是唯一的分发来源。** 不存在第二个投递媒介，作业状态机、退避与租约收割都由该表表达；`claimSummaryJob` 的条件 `UPDATE` 是唯一的领取权威。
2. **调度是进程内串行 runner。** `apps/worker/src/runner.ts` 的 `createSummaryRunner().runDueJobs()` 顺序处理当轮全部到期作业，`apps/worker/src/main.ts` 以 `SUMMARY_POLL_INTERVAL_MS`（2000 ms）轮询驱动，并用 in-flight 门跳过上一轮尚未跑完的 tick。并发保持 1，与被移除的 BullMQ `concurrency: 1` 一致。轮询延迟仍是最多 2 秒，与移除前相同，不是回退。
3. **崩溃恢复由租约而非队列承担。** worker 被杀死留下的 `running` 行在五分钟后被重新选中；退避重试由 `next_attempt_at` 驱动。这两条在移除前就已经是唯一生效的路径。
4. **`/readyz` 的依赖集缩小为 `{ postgres }`。** 这是一次**已发布响应契约的变更**，体现在生成的 [OpenAPI](contracts/api/openapi.yaml) 中。不保留 `redis: "skipped"` 占位：生成的契约只暴露真实存在的依赖，长期返回一个不存在的依赖项是不诚实的描述。当前消费者只有本仓库内的 Web 状态页与 Compose `api` healthcheck，且两者都只判断状态码，不读取 `dependencies` 结构。
5. **默认栈只有两个镜像。** `postgres` 与一个应用镜像；api/worker/web/migrate 四个服务共用该镜像的同一批层，加上 `postgres` 共五个 Compose 服务（`migrate` 为一次性）。`infra/images.lock` 相应地只固定两个 digest-pinned image。
6. **PostgreSQL 作业领取仍是正确性权威。** input hash、base revision、job nonce、唯一约束与单事务提交没有任何改动，因此 ADR 0006 关于幂等与 outbox 的结论原样成立，并且在移除一个 at-least-once 中间层之后更强。

### Superseded 范围

本 ADR **只** supersede 以下三处与队列传输相关的条款，三个 ADR 的其余结论全部继续有效：

| ADR                                                              | 被 supersede 的条款                                        | 继续成立的部分                                                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`0006`](#adr-0006postgresql-幂等与-outbox) transactional outbox | 「BullMQ 按 at-least-once 使用」「Redis 丢失可以重建投递」 | PostgreSQL input hash / base revision / 唯一约束保证正确性；raw insert、revision/job result、SSE event 各自与业务写入同事务；数据库提交前不得 ack |
| [`0008`](#adr-0008pnpm-typescript-monorepo) TypeScript monorepo  | 组成清单中的「BullMQ worker」                              | pnpm workspace + Turbo 布局、精确版本锁定、frozen lockfile、边界包分层与禁止跨层复制契约                                                          |
| [`0009`](#adr-0009本地单用户与-loopback) loopback 单用户         | 「Redis 只在私有 bridge 内可达」                           | 首发无 auth/RBAC/tenant；只有 Web 发布到 `127.0.0.1`；API 与 PostgreSQL 无宿主端口；任何公网/LAN 暴露都必须先新增认证与威胁模型                   |

三个原 ADR 的正文不修改，符合「一旦 Accepted 不改写结论」的仓库规则。

### 后果

优点：外部运行时依赖从三个减到两个；分发链路少一次网络往返与一个 native addon；`/readyz` 与 OpenAPI 只描述真实存在的依赖；排障面收敛到一张可用 SQL 直接查询的表（见 [Runbook：Summary 作业队列](operations/runbooks.md#runbooksummary-作业队列)）。

代价：**不再提供跨主机 worker 水平扩展的现成路径。** 移除队列后 worker 与 API 只能靠共享数据库协调，仓库不再随栈提供任何分布式投递组件。ADR 0009 已经把首发定为单主机单用户，因此这是与既有边界一致的 YAGNI 取舍，而不是新的技术限制：`claimSummaryJob` 是带条件的原子 `UPDATE`，`summary_jobs` 本就支持多消费者，将来确需扩展时可以直接多进程（乃至多主机连同一个 PostgreSQL）竞争同一张表，或重新引入队列并新建 ADR。

`/readyz` 契约变更对仓库外消费者是破坏性的；当前没有仓库外消费者，风险局限在本仓库内。

## ADR 索引

_状态：current · owner：architecture · last_reviewed：2026-08-10 · milestone：Gate 0_

Accepted：[`0001`](#adr-0001etg-与-eig-分层) 双图、[`0002`](#adr-0002契约事实源) 契约事实源、[`0003`](#adr-0003不可变-revision-与-watermark) revision、[`0004`](#adr-0004确定性-reducer) reducer、[`0005`](#adr-0005内容寻址-artifactstore) artifact、[`0006`](#adr-0006postgresql-幂等与-outbox) outbox、[`0007`](#adr-0007rest-快照与-durable-sse) REST/SSE、[`0008`](#adr-0008pnpm-typescript-monorepo) monorepo、[`0009`](#adr-0009本地单用户与-loopback) loopback、[`0010`](#adr-0010provider-egress-安全门) provider gate、[`0012`](#adr-0012显式授权根内的两阶段会话导入) 两阶段 guided import、[`0013`](#adr-0013浏览器交付的会话上传) 浏览器交付的会话上传、[`0014`](#adr-0014postgresql-单源作业调度) PostgreSQL 单源作业调度。ADR 0011 的权限边界由 0012 保留，其旧的一层文件实现限制已 superseded。ADR 0014 只 supersede 0006、0008、0009 中与队列传输相关的条款；0006 的 PostgreSQL 幂等/outbox 结论与 0009 的 loopback 边界继续成立。

ADR 一旦 Accepted 不改写结论；替代时新建 ADR 并标记 superseded。Draft 接口不进入实际 OpenAPI。
