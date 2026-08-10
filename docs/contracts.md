---
status: accepted
owner: maintainers
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0-Gate 5
---

# 契约

本文是数据、幂等、reducer、artifact、adapter、provider 与兼容性七类契约的集合。API 层面的路由、错误码与流协议单独放在 [`contracts/api.md`](contracts/api.md)，生成的 OpenAPI 在 [`contracts/api/openapi.yaml`](contracts/api/openapi.yaml)。

## 领域模型

`RawTraceEvent` 是 `schemaVersion` 版本化 envelope：server event ID、workspace/project/trace、source kind/session/event ID、adapter name/version、source time、server `ingestSeq`、agent/span/parent lineage、event kind、状态、payload hash/ref、artifact refs。数据库不得内联完整 raw payload。

EIG 的 `SemanticNode` 分 `request|goal|work|decision|issue|handoff|result`，状态为 `proposed|active|blocked|completed|abandoned|superseded`；正式已提交图不接收 provider 的 proposed 可见状态。每个 node version 有 intent/action/outcome claim，它们分别引用 evidence。Edge 有独立 logical/version ID、方向、kind 和 evidence。

`suggestedConfidence` 只存在于 provider patch；canonical claim 的 `confidence` 是 reducer 按证据规则得到的 `high|medium|low`。`stated|inferred|mixed` 表示 provenance，不表示概率。

## Revision 模型

Revision 是不可变图快照引用集，不复制未变化实体。字段至少含 revision ID、trace ID、parent revision ID、branch kind、event watermark、status、stale reason、created at/source job。Node/edge membership 指向 immutable version；logical ID 在版本间稳定。迟到事实不会改写图内容或 membership；数据库只允许 revision 的 `stale` 元数据执行一次单向 `false → true` 迁移，任何反向迁移或同时修改其他字段均被触发器拒绝。

`live` revision 可随已验证 chunk 增长；`final` 只在 complete marker 与 reconciliation 后生成；`human` 从选定 parent 分支并保存 pin/edit。迟到 event 高于 final watermark 时，旧 final 保留但标 stale，后续生成新 final。并发 reducer 必须以 `baseRevisionId` compare-and-commit；过期 base 返回冲突并重新排队，不能自动覆写。

Replay 查询必须同时给定 trace 与 watermark/revision，不能以当前 membership 回填历史时刻。

## Event 排序与幂等

Source time 可缺失、重复或回退，只用于展示。规范处理顺序是 trace 内服务器分配的 `ingestSeq`，分配与 raw insert 在同一事务，不能由 Redis 或进程内计数器承担。

幂等 identity 为 source kind + source session ID + source event ID。Canonical normalization 后计算 payload SHA-256：首次写入分配 server ID/sequence；重复 identity + 相同 hash 返回原记录并标 `duplicate`; 重复 identity + 不同 hash 返回 HTTP 409、code `integrity_conflict`，两份内容都不被覆盖。

start/end/correction/complete/late 都是追加 event。乱序可接受；malformed ID 在 adapter 边界 fail-visible，只有规范明确允许的修复才可产生新 normalized 字段，并保留原 payload ref。

## Reducer 契约

Patch 必须包含 `schemaVersion`、`jobNonce`、`baseRevisionId`、有序 operations 和 unresolved questions。新增实体用本 patch 唯一的 `tmp:<n>` 引用；其他 ID 必须属于 base revision 或 allowlist。Operation 是显式 `add_node|update_node|add_edge|retire_edge|supersede_node|suggest_merge`，不接受通用 JSON Patch。

Reducer 按固定顺序执行：schema/size → nonce/base/input hash → evidence/artifact/agent allowlist → temp ref 解析 → field operation → status transition → edge direction/self-edge/cycle → dedupe/merge → pin precedence → claim confidence → canonical sort/hash → transaction commit。任何失败都拒绝整个 patch。

数组只能 `replace|append_unique|remove`；nullable 字段用显式 `clear`，不得把缺失解释为清空。Human pinned title/parent/status/claim 优先于 provider；provider 不能 retire/supersede pinned entity。`depends_on`/`decomposes_to` 等方向写入 schema 映射并测试。重复相同 patch 返回既有 revision。

Evidence 规则：每个 add/update node 与 edge 至少一个允许 event；completion/result 必须包含 outcome evidence；只有显式通过测试、已创建 artifact、成功命令或直接结果才可得 high。模型建议最多降低审查优先级，不能提高最终等级。

## Artifact 与 Evidence 契约

Artifact 以 `(traceId, sha256)` 内容寻址，metadata 记录 byte length、media type、创建时间和可选 redaction state。`put` 必须先计算 hash、原子落盘；`stat` 不返回内容；`getRange` 只读明确范围；`deleteTrace` 删除该 trace 名空间。路径不能由用户输入拼接。

Evidence 是 claim 到 raw event/artifact 的关系，记录 evidence kind 与可选 range。Intent、action、outcome 分别建立 claim，不能用同一个“node confidence”掩盖证据差异。UI 展示摘要默认转义；源码、终端、HTML 都按 untrusted content 处理，下载与内联渲染有独立 media policy。

删除 trace 时先阻止新写入，再删除数据库 membership/evidence/metadata 与 artifact namespace，最后写本地 audit 结果；备份中删除遵循 retention 文档，不承诺即时物理抹除。

## Adapter 契约

Adapter 声明 source kind、adapter name/version、支持的 source versions 和 capability。输入必须转为 canonical envelope，未知 source version 返回可诊断错误，禁止 best-effort 静默吞字段。所有 adapter 都输出 source identity、lineage、source time、status、payload hash/ref 与 warnings。

MVP adapter：canonical JSONL、OTLP HTTP JSON、Codex session、Claude session。每种至少三份匿名 fixture：正常、边界/乱序、未知/畸形。Codex/Claude 不依赖隐藏推理字段；只导入用户可见 message、tool/result、必要 metadata 与 artifact references。Codex `reasoning`、`encrypted_content`、world state/instruction snapshot，以及 Claude `thinking`/`redacted_thinking`、file-history snapshot、duplicate last-prompt 等记录必须产生可计数 warning 后丢弃；生成的 event 和 artifact 都不得包含这些结构。

Canonical event `name` 必须是可读的 bounded preview，而不是 `message`/`assistant`/`response_item` 等结构占位：message 提取可见 text，tool call 提取 tool name 与 input preview，tool result 提取 output preview，error/lifecycle/agent activity 分别生成明确标签。完整脱敏 source record 保存在 `payloadRef`，raw UI 按需读取；纯 Codex reasoning 或纯 Claude thinking 记录不能生成空 event。preview 不是独立事实，完整 payload 仍是证据权威。

Collector 的 guided import 在 adapter 前后增加两阶段边界：`discover`/`dry-run` 只返回经 `SessionCatalogSchema` 校验的 bounded descriptor，默认不输出 visible prompt；`import --session` 用 opaque、授权根作用域内且绑定候选 metadata 的 catalog ID 精确选择。绝对/相对 path、文件名和 native session ID 不属于公开 catalog。真正 import 必须先完整消费 adapter 输出并通过 Zod validation，再发送该文件的第一条 event；preflight warning 只允许 code、计数和不含 source 正文的诊断；无法安全描述的 candidate 必须计入 `rejectedFiles`，不能静默跳过。

Source format version 与客户端版本分开：只有显式 `codex-jsonl-*`/`claude-jsonl-*` 声明参与 compatibility gate，Codex/Claude CLI 的普通 semver 仅记录为 `clientVersion`。发生改变 canonical event content 的 adapter major upgrade 时，normalization namespace 必须变化，使新导入形成独立 trace；禁止覆盖旧 raw facts。离线 `import` 在文件末尾追加由完整文件 SHA-256 派生 ID 的确定性 `trace_complete` marker；同一 adapter major 下完整重放 marker 和所有 event 均幂等，文件变化生成新 marker。`follow` 不伪造完成状态。

OTLP 接受 HTTP JSON 和 gzip，处理标准 trace/span ID、64-bit 字符串编码及 partial-success；gRPC 延后。Adapter 不写数据库、不访问 provider，也不决定语义 node。

## Summarizer Provider 契约

Provider 接收确定性 event sketch、root intent、active nodes、candidate parents、allowlisted event/artifact/agent IDs、locale、prompt version、job nonce 和 base revision。默认不发送源码正文、完整文档、完整终端日志或 secret；chunk input 先 canonical hash 以便缓存和审计。

每个 summary job 的 sketch 只包含 `(previous job watermark, current watermark]` 的确定性 chunk，不能反复发送整个 trace 前缀。Sketch 至少携带 event ID、kind、status、agent、可读 bounded name、content type 和该 event 的 allowlisted artifact IDs。永久 mock provider 必须优先选择 error、user/assistant message、tool result/call 等内容事件，避免 token count、mode、context 等遥测占据语义节点；final marker 可作为完成证据，但不能用 “Offline import complete” 取代实际 outcome 内容。

输出只能是 provider patch，随后本地完整 Zod 与 reducer 校验。Mock provider 永久可用且无网络。真实 provider 只有在 Gate 4 egress gate 开启后可选；registry 记录 provider、model/snapshot、能力、价格日期和 prompt version，业务逻辑不写死价格或“最新模型”。

Timeout、429、预算耗尽、bad JSON、schema/reducer 拒绝都产生结构化 provider call 结果并回退 raw-only；默认不跨 provider fallback。不得记录 key、Authorization header 或未 redacted prompt。

## 兼容性策略

Envelope、patch、checkpoint、SSE 和公开 API 均有显式版本。增加 optional 字段属于同 minor；改变语义、required 字段或 enum 删除需新 major 和 migration/adapter。读取器必须拒绝未知 major，未知 minor 字段可在 schema 允许时忽略并保留原 payload ref。

依赖全部精确版本，lockfile 由 CI frozen 安装。根级 `pnpm-workspace.yaml` override 也是受审依赖契约；当前将 Next 的传递依赖固定为 `postcss 8.5.25`、`sharp 0.35.0`，用于修复 2026-08-03 审计命中的已知漏洞。升级单独提交，必须通过 typecheck、production audit、migration 空库/重复运行、schema drift、fixtures、许可证与 Compose smoke。生成 JSON Schema/OpenAPI 属于提交产物；源码与生成物不一致时 CI 失败。

第一发布支持 Linux x86_64。Node Collector 使用可移植 API，但 macOS/Windows 在完成 fixture 与 follow/rotation 验证前不做正式支持声明。
