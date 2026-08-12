---
status: draft
owner: maintainers
last_reviewed: 2026-08-12
normative: true
milestone: Gate 5
---

# Agent spawn 与 join 拓扑

语义图当前在任何数据上都只能渲染成一条链。本文定义把 spawn（派发）与 join（规约）表达为事实、并由确定性 reducer 派生成结构边的设计。范围是 canonical 事件模型、reducer 派生规则、以及 demo 录制的重生成；**三个 harness 的 adapter 改造不在本文范围**，见末节。

## 问题

三处独立缺陷，任何一处单独修复都不足以让图变成 DAG。

**派生层（决定性）。** `packages/summarizer/src/index.ts:96` 取 `input.allowedNodeIds.at(-1)` 作为新节点的 `primaryParentRef`（`:118`）并据此建边（`:129-137`）。parent 恒等于"最近创建的节点"，与 agent、span、时间重叠无关，因此拓扑恒等于 ingest 顺序。已提交的 demo revision 上实测 5 条边全部是 `attempts`×4 + `produces`×1 的单链，其中 `ImoConstructions → ImoImpossibility` 在真实运行里并不存在——两者是被同时派出的兄弟。

**切分层。** `packages/db/src/repository.ts:409-411` 以全局 ingestSeq（第 1 条、每 50 条、`trace_complete`）建 summary job，chunk 横跨所有 agent；`packages/summarizer/src/index.ts:89` 每个 chunk 只选一条事件建一个节点。6 个 job → 6 个节点，六条并行泳道被压成六个采样点。

**数据层。** demo 录制里 `parentSpanId` 存的是原始 transcript 的记录链（`#5` 的 `parentSpanId: a18bc459` 就是那条 transcript record 的 `parentId`），不是因果父；5 个子 agent 的根 span 没有 parent。spawn 关系只以自然语言形式存在于 `tool_result(task)` 的 payload 文本中（`- \`ImoBruteForce\` (job \`ImoBruteForce\`)`），join 关系只存在于 `hub` 结果文本（`### ImoConstructions [task] — completed`）。`artifactRefs` 在 231 条事件上全为空，因此产物流动无法成边。

视图层不是缺陷：`apps/web/components/workbench/graph/GraphPanel.tsx:80-119` 已经用 ELK 分层布局、按 `primaryAgentId` 分泳道、并消费 `graph.edges`。给它扇出扇入的边集即可渲染真实 DAG。

## 目标与非目标

目标：

- spawn 与 join 成为**事实**而非推断，`provenance` 为 `stated`，每条结构边都能回到具体 raw event。
- 结构边由确定性 reducer 产出，provider 不再决定 parent，符合[系统不变量](../architecture.md#system-invariants)与 [reducer 契约](../contracts.md#reducer-contract)。
- 同一套字段既服务于 demo 录制，也服务于后续的 harness adapter，不为 demo 造特例。

非目标：

- 不改节点密度。每个 chunk 一个节点的问题（切分层）留待独立设计；本文只保证既有节点之间的边正确。
- 不新增语义边类型。`SemanticEdgeKindSchema`（`packages/schema/src/index.ts:327-338`）已有 `decomposes_to`、`hands_off_to`、`depends_on`、`supports`、`blocks`、`resolved_by`、`produces`，够用。
- 不改视图层。
- 不做 adapter 改造。

## 概念模型

四种关系，彼此正交：

| 关系  | 含义                              | 事实来源                                        |
| ----- | --------------------------------- | ----------------------------------------------- |
| lane  | 一个 agent 的执行序列             | `agentId`                                       |
| spawn | 父 agent 的某次调用创建了子 agent | 父侧 `agent_handoff` + 子侧 `agent_start`       |
| join  | 子 agent 的产物被父 agent 收敛    | 子侧 `agent_end` + 父侧等待调用的 `tool_result` |
| human | 人对某个节点的干预                | 真人 `user_message`；`node_feedback` 行         |

关键区分：机器注入的任务书与真人请求在当前模型里都是 `kind: user_message`，无法区分。demo 录制 6 条 `user_message` 中只有第 1 条是真人，其余 5 条是编排者派活时注入的任务书。任务书是**子 lane 的目标**，不是用户意图。

## Canonical 事件模型变更

三项，均为加法。

**1. `attributes.parentAgentId`（子侧）。** 子 agent 的 `agent_start` 携带派生它的 agent id。这是 lane 级父子关系，与具体调用点无关。

**2. `parentSpanId` 语义收敛（子侧）。** 子 lane 首个事件的 `parentSpanId` 必须指向**父侧那次派发调用的 span**，而不是同 lane 的上一条记录。同 lane 内的顺序由 `occurredAt` 与 `ingestSeq` 表达，不需要链表。这是语义修正，不是新字段：`parentSpanId` 已存在于 `packages/schema/src/index.ts:204`、DB 列 `parent_span_id`（`packages/db/src/schema.ts:127`）与 repository 双向映射。

**3. `causationSourceEventId`（input-only）。** `causationEventId`（`packages/schema/src/index.ts:201`）已存在于 schema、DB 列与 repository 映射，但 `packages/db/src/repository.ts:353` 是 `const eventId = randomUUID()`，生产者无法预知服务端 UUID，因此该字段至今无人写入。在 `RawTraceEventInputSchema` 上新增 input-only 的 `causationSourceEventId`（同 trace 内的 `source.sourceEventId`），由 ingest 在同一事务内解析成 `causation_event_id`。解析不到时以 warning 落库为 null，不拒绝事件——raw 事实优先于关系完整性。

不采用的替代方案：把 `eventId` 改成由身份四元组派生的确定性 UUID。它同样能让生产者预填 `causationEventId`，但会改变既有行的 id 生成语义，牵动幂等与外键，收益不足以抵消风险。

`artifactRefs`（`packages/schema/src/index.ts:213`）已经存在且为空数组，产物关系直接使用它，不需要新字段。

## Reducer 派生规则

结构边在 reducer 提交 revision 时由 raw 事实生成，不经过 provider。

**前置缺陷：committed 边不带证据。** `ProviderGraphEdgeSchema`（`packages/schema/src/index.ts:481-488`）要求 `evidenceEventIds` 至少一条，但 `packages/intent-reducer/src/index.ts:395-406` 在提交时只保留 `logicalEdgeId/versionId/source/target/kind/retired`，证据被丢弃；读模型 `SemanticEdgeVersionSchema`（`packages/schema/src/index.ts:395-405`）与表 `semantic_edge_versions`（`packages/db/src/schema.ts:239-257`）也都没有证据或 provenance 列。若不修复，本文产出的结构边就是一组无法审计的断言，与 `AGENTS.md` 的 "evidence-backed" 不变量冲突。因此本设计包含：给 `semantic_edge_versions` 增加 `evidence_event_ids` 与 `provenance` 两列（Drizzle schema + 提交进仓库的 migration），reducer 不再丢弃 `evidenceEventIds`，读模型与生成的 JSON Schema/OpenAPI 相应更新。

**artifact 不是节点。** `SemanticNodeKindSchema`（`packages/schema/src/index.ts:285-293`）没有 artifact 类型；artifact 通过节点的 `artifactIds` 挂载。因此涉及产物的边一律连接**持有该 artifact 的节点**，而不是 artifact 本身。

下表每条边的 `provenance` 均为 `stated`，`evidenceEventIds` 为"事实"列列出的 raw event。

| 边              | 源 → 目标                                      | 事实                                                                 |
| --------------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| `decomposes_to` | 父 lane 的 handoff 节点 → 子 lane 的首节点     | `agent_handoff` + 子侧 `agent_start.attributes.parentAgentId`        |
| `hands_off_to`  | 子 lane 的末节点 → 父 lane 收敛处的节点        | `agent_end` + 父侧等待调用的 `tool_result.attributes.joinedAgentIds` |
| `depends_on`    | 消费方节点 → 持有该 artifact 的生产方节点      | 两个节点的 `artifactIds` 交集非空                                    |
| `produces`      | 代持写入节点 → 持有该 artifact 的节点          | `file_write.attributes.onBehalfOf` + `artifactRefs`                  |
| `blocks`        | 工具缺失的 issue 节点 → 被阻塞 lane 的后继节点 | `tool_result` 且 `status = "error"`                                  |
| `revises`       | 人的反馈 → 目标节点                            | `node_feedback` 行（`packages/db/src/schema.ts:421`）                |

两条兜底规则，二者都优先于"把边画出来"：

- `depends_on` 只在 `artifactIds` 交集非空时生成。仅凭时间先后推断依赖是推断而非事实，与本文的 `stated` 目标冲突，宁可缺边。
- 任何解析后源与目标落在同一节点的边一律丢弃：`semantic_edge_versions` 有 `semantic_edges_no_self_edge` 约束（`packages/db/src/schema.ts:255`），自环会让整个 patch 失败。`blocks` 在被阻塞 lane 没有后继节点时同样省略。

`packages/summarizer/src/index.ts:96`、`:118`、`:129-137` 一并删除：provider 只提节点语义（`kind`、`title`、`claims`），parent 与边不再由它决定。这样真实 LLM 也无法幻觉出错误结构，且 `ChunkSummaryInput` 接口不必扩展。

`primaryParentId`（`packages/db/src/schema.ts:220`）由 reducer 按同一规则回填：同 lane 最近节点优先，否则派生它的 lane 的对应节点，否则 request 根。

## 录制重生成

现存 transcript 仍在 `2026-08-12T13-41-44-827Z_*` 会话目录下（主 session 175 条记录 + 8 个子 agent 文件），因此重跑 recorder 可行。重生成不重跑 agent。

recorder 变更：

- 子 `agent_start` 写 `attributes.parentAgentId` 与指向父侧 handoff span 的 `parentSpanId`。
- `tool_result(task)` 写 `attributes.spawnedAgentIds`，值从其 payload 文本的 ``- `<Name>` (job `<Name>`)`` 列表提取。
- `agent_end` 写 `attributes.joinedBy` 与 `artifactRefs`。
- `tool_result(hub)` 写 `attributes.joinedAgentIds`，值从 `### <Name> [task] — completed` 提取。
- 编排者代持写入的 `file_write` 写 `attributes.onBehalfOf` 与 `artifactRefs`。
- 任务书 `user_message` 写 `attributes.assignedBy`，据此与真人请求区分。
- 补录被丢弃的 3 条 scout 泳道（`WebUiSurface`、`IngestAndFixtures`、`DocsConventions`）。当前录制只有 6 条泳道，而 `#8` 明确记录 spawn 了这三个 agent，`#79` 的 join 因此指向一条不存在的 lane。

`parentSpanId` 不再存放 transcript 记录链；同 lane 顺序由时间与 ingestSeq 表达。

## 影响面与验证

变更集中在 `packages/schema`（input-only 字段 + 边读模型）、`packages/db`（ingest 解析、`semantic_edge_versions` 两列与其 migration）、`packages/intent-reducer`（结构边派生、不再丢弃边证据）、`packages/summarizer`（删除 `at(-1)`）、以及录制与其 fixture。

验证：

- schema、OpenAPI 与 Drizzle migration 由 `pnpm schema:check` 守住（`drizzle-kit check` 在同一命令内）；生成产物不得手改，migration 必须提交进仓库。
- 契约测试断言重生成后的 fixture：泳道数、`parentAgentId` 覆盖率、`spawnedAgentIds` 与实际 `agent_start` 集合一致、`joinedAgentIds` 与 `agent_end` 集合一致。
- 端到端证据是图本身：导入重生成的录制后，`/graph` 必须出现 `decomposes_to` 扇出与 `hands_off_to` 扇入，而不是单链；README 截图随之重拍。
- 全部门禁按 `AGENTS.md` 执行，证据记入 `project/progress.md`。

## 风险

- **重生成改变 fixture 内容**，README 截图、契约测试计数与 `project/progress.md` 的既有记录都要同步更新。这是一次性成本，但必须在同一轮内完成，否则仓库处于自相矛盾状态。
- **`causationSourceEventId` 解析依赖同 trace 内的事件已先行入库**。乱序导入时父事件可能后到；此时字段落 null 并留 warning，不重试、不阻塞。关系完整性由 reducer 在派生时按 `agentId` 与 span 兜底。
- **规则从文本提取**（`spawnedAgentIds`、`joinedAgentIds`）依赖 harness 的输出文案格式。这一层只存在于 recorder，不进入运行时代码路径；adapter 侧应优先使用各 harness 的结构化字段。

## 后续

adapter 改造单独成文。已核实的事实：三个 harness 都以一等字段记录 spawn——Claude Code 在 `<root>/subagents/agent-<id>.meta.json` 的 `{agentType, description, toolUseId, parentAgentId, spawnDepth}`，Codex 在子 rollout 的 `session_meta.payload.parent_thread_id` 与 `source.subagent.thread_spawn`，opencode 在 `session.parent_id` 与 `task` part 的 `state.metadata.sessionId`。当前 `packages/adapters/src/claude.ts:267` 与 `packages/adapters/src/codex.ts:306` 把整个 session 压成单一 `agentId`，`packages/adapters/src/common.ts:112` 又让每个 session 文件自成一条 trace，因此这些字段全部丢失。读取兄弟子 transcript 会触碰[适配器契约](../contracts.md#adapter-contract)与安全边界中"服务端不枚举目录"的约束，需要把 `AdapterInput`（`packages/adapters/src/types.ts:10-13`）从单文件改为 session bundle，由浏览器目录选择或 Collector 授权根提供。
