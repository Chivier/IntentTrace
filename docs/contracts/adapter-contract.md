---
status: accepted
owner: ingestion
last_reviewed: 2026-08-06
normative: true
milestone: Gate 1
---

# Adapter 契约

Adapter 声明 source kind、adapter name/version、支持的 source versions 和 capability。输入必须转为 canonical envelope，未知 source version 返回可诊断错误，禁止 best-effort 静默吞字段。所有 adapter 都输出 source identity、lineage、source time、status、payload hash/ref 与 warnings。

MVP adapter：canonical JSONL、OTLP HTTP JSON、Codex session、Claude session。每种至少三份匿名 fixture：正常、边界/乱序、未知/畸形。Codex/Claude 不依赖隐藏推理字段；只导入用户可见 message、tool/result、必要 metadata 与 artifact references。Codex `reasoning`、`encrypted_content`、world state/instruction snapshot，以及 Claude `thinking`/`redacted_thinking`、file-history snapshot、duplicate last-prompt 等记录必须产生可计数 warning 后丢弃；生成的 event 和 artifact 都不得包含这些结构。

Canonical event `name` 必须是可读的 bounded preview，而不是 `message`/`assistant`/`response_item` 等结构占位：message 提取可见 text，tool call 提取 tool name 与 input preview，tool result 提取 output preview，error/lifecycle/agent activity 分别生成明确标签。完整脱敏 source record 保存在 `payloadRef`，raw UI 按需读取；纯 Codex reasoning 或纯 Claude thinking 记录不能生成空 event。preview 不是独立事实，完整 payload 仍是证据权威。

Collector 的 guided import 在 adapter 前后增加两阶段边界：`discover`/`dry-run` 只返回经 `SessionCatalogSchema` 校验的 bounded descriptor，默认不输出 visible prompt；`import --session` 用 opaque、授权根作用域内且绑定候选 metadata 的 catalog ID 精确选择。绝对/相对 path、文件名和 native session ID 不属于公开 catalog。真正 import 必须先完整消费 adapter 输出并通过 Zod validation，再发送该文件的第一条 event；preflight warning 只允许 code、计数和不含 source 正文的诊断；无法安全描述的 candidate 必须计入 `rejectedFiles`，不能静默跳过。

Source format version 与客户端版本分开：只有显式 `codex-jsonl-*`/`claude-jsonl-*` 声明参与 compatibility gate，Codex/Claude CLI 的普通 semver 仅记录为 `clientVersion`。发生改变 canonical event content 的 adapter major upgrade 时，normalization namespace 必须变化，使新导入形成独立 trace；禁止覆盖旧 raw facts。离线 `import` 在文件末尾追加由完整文件 SHA-256 派生 ID 的确定性 `trace_complete` marker；同一 adapter major 下完整重放 marker 和所有 event 均幂等，文件变化生成新 marker。`follow` 不伪造完成状态。

OTLP 接受 HTTP JSON 和 gzip，处理标准 trace/span ID、64-bit 字符串编码及 partial-success；gRPC 延后。Adapter 不写数据库、不访问 provider，也不决定语义 node。
