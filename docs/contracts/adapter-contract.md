---
status: accepted
owner: ingestion
last_reviewed: 2026-08-04
normative: true
milestone: Gate 1
---

# Adapter 契约

Adapter 声明 source kind、adapter name/version、支持的 source versions 和 capability。输入必须转为 canonical envelope，未知 source version 返回可诊断错误，禁止 best-effort 静默吞字段。所有 adapter 都输出 source identity、lineage、source time、status、payload hash/ref 与 warnings。

MVP adapter：canonical JSONL、OTLP HTTP JSON、Codex session、Claude session。每种至少三份匿名 fixture：正常、边界/乱序、未知/畸形。Codex/Claude 不依赖隐藏推理字段；只导入用户可见 message、tool/result、必要 metadata 与 artifact references。Codex `reasoning`、`encrypted_content`、world state/instruction snapshot，以及 Claude `thinking`/`redacted_thinking`、file-history snapshot、duplicate last-prompt 等记录必须产生可计数 warning 后丢弃；生成的 event 和 artifact 都不得包含这些结构。

Source format version 与客户端版本分开：只有显式 `codex-jsonl-*`/`claude-jsonl-*` 声明参与 compatibility gate，Codex/Claude CLI 的普通 semver 仅记录为 `clientVersion`。离线 `import` 在文件末尾追加由完整文件 SHA-256 派生 ID 的确定性 `trace_complete` marker；同一文件重放 marker 幂等，文件变化生成新 marker。`follow` 不伪造完成状态。

OTLP 接受 HTTP JSON 和 gzip，处理标准 trace/span ID、64-bit 字符串编码及 partial-success；gRPC 延后。Adapter 不写数据库、不访问 provider，也不决定语义 node。
