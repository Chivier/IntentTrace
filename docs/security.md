---
status: accepted
owner: security
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0-Gate 5
---

# 安全

本文合并威胁模型、数据处理边界与 provider egress policy。三节共同定义“默认无云 egress、无 home 扫描、无隐藏推理字段”这条产品边界的具体执行方式。

## 威胁模型

资产：用户 trace、源码/终端 artifact、provider key、数据库、semantic claim、Collector checkpoint。信任边界：宿主文件系统→Collector、浏览器（操作者显式选择的文件）→Web proxy→API、Collector/OTLP→API、数据库→web、event sketch→provider、provider patch→reducer、浏览器→artifact renderer。

主要威胁：显式路径之外读取或 symlink 越界；payload 中 secret 经日志/provider 外泄；stored XSS；文档/日志 prompt injection；source ID collision 改写事实；恶意 patch 伪造 evidence/cycle/pin；SSE 越权/旧 cursor 混流；Docker 端口意外公网暴露；备份泄漏。

浏览器→API 上传边界的具体威胁与缓解：字节由用户代理的文件选择器交出，网页无法自行枚举目录，服务端也不接受路径参数，因此这条边界不引入新的宿主文件系统读取能力。超大体积由 `IMPORT_UPLOAD_MAX_BYTES`（默认 64 MiB）在 Fastify content-type parser 层截断为 413，而不是耗尽内存；错误 content-type 直接 415。上传字节走与 CLI 完全相同的 adapter omission 与 Zod preflight，恶意或畸形文件在写入第一条 raw fact 之前失败，返回 422 且插入 0 条。候选检查只读前 64 KiB、只发一次批量查询、不写任何东西。文件名只用于派生 `sourceIdentity`，不进入 descriptor、不回显。prompt preview 需要 `includePreviews: true` 显式同意，且上限 160 字符。

现有缓解：动态 loopback 单入口、API 无文件读取、Collector 显式 path + symlink reject、上传体积上限与 413/415 显式映射、provider 多条件门禁和域名 allowlist、日志/egress redaction、strict schema、deterministic reducer、claim evidence allowlist、attachment artifact、确认式删除和备份 hash。剩余风险是本地无认证、主机/volume 无应用层加密、Docker Desktop 权限、上传字节在 browser/Next/Fastify 三处完整驻留内存，以及未在真实 key 环境做 provider canary；Loopback 不使 trace 内容可信。

## 数据处理

只采集操作员显式导入的 trace。API 不扫描目录，Collector 不主动扫描 home；Collector 只遍历显式命名的文件或目录根，递归读取 `.jsonl`/`.ndjson` regular files，每层拒绝 symlink 边界，并以 realpath/file identity/offset/prefix hash 跟踪。`discover` 发起 0 个 API 请求；实际 import/follow 的 `--api` 在 local MVP 只允许 loopback hostname/address，防止误配置 raw egress；catalog 默认不输出 prompt，且永不输出授权根、cwd、相对路径、文件名或 native session ID，只有显式 `--include-previews` 才把最长 160 字符的 visible prompt preview 写到 stdout。Raw payload 与大 artifact 默认留在内容寻址本地 volume，数据库保存 hash/ref 和最小 metadata。

日志禁止 Authorization/cookie/provider key、payload 正文、完整 prompt/response。UI 以 React text 呈现不可信字段；artifact 设置 attachment、nosniff 和 sandbox CSP，HTML/SVG 强制 octet-stream。Provider egress 在发送前做 event cap 与 secret redaction，数据库只留 hash、usage/cost 和 report。

目录 candidate 还要通过 realpath containment 与 inode/size/mtime 复核；stat/race/越界文件计入 `rejectedFiles` 并非零退出。每个本地 session 在第一条 raw fact 发送前必须完成全文件 adapter/Zod preflight；malformed/unsupported/无 visible event 的 candidate 插入 0 条并 fail-visible，不能留下 adapter-level 半导入。API 发送中途失败时，已写入的前缀仍是不可覆盖事实，重试按 source identity 幂等补齐。本地 session 也遵循内容边界：可见 user/assistant message 与 tool call/result 可进入 raw artifact；Codex reasoning/encrypted blocks、Claude thinking/signature、系统 instruction/world-state/file-history snapshot 在 adapter 层删除，不能仅依赖 UI 隐藏。Omission 只输出类型、行号和计数 warning，不输出被删除正文。

浏览器上传的字节遵守完全相同的规则：`POST /api/v1/imports/sessions` 调用与 collector 同一个 `prepareSessionBytes`，因此同样的 adapter omission（Codex reasoning/encrypted blocks、Claude thinking/signature、系统 instruction/world-state/file-history snapshot）在写库前生效，同样的全文件 Zod preflight 在第一条 raw fact 之前完成。上传的文件名只用于 `safeIdentifier(basename(fileName))` 派生 `sourceIdentity`——与 collector 从磁盘 basename 派生的值一致，使同一文件的两条导入路径落在同一 project——文件名本身不进入 descriptor、不写日志、不回显给客户端。候选检查默认返回 generic title 与 `null` preview，只有 `includePreviews: true` 才返回最长 160 字符的 visible prompt preview，与 CLI 的 `--include-previews` 是同一实现。

Fixture 必须合成或不可逆匿名化，保留 provenance manifest。`.env`、artifact volume、数据库 dump、真实 Codex/Claude session 不进 Git；真实文件路径、session ID 和对话正文也不写入 progress 证据。备份加访问控制；当前本地 demo 未实现加密-at-rest，使用者必须依赖主机/volume 权限。

## Provider Egress Policy

默认和测试都是 `PROVIDER_MODE=mock`、`PROVIDER_EGRESS_ENABLED=false`。选择 `openai|deepseek` 时，loader 同时要求 egress=true、正预算、key、明确 model，并限制 host 为 `api.openai.com` 或 `api.deepseek.com`。event-sketch 截断、secret redaction、prompt-injection data boundary、timeout、local Zod/reducer 与 raw-only failure path 均在网络前后强制执行。

允许发送：经 policy 版本化处理的短摘要、必要 ID 别名和结构信息。默认禁止：源码/完整 diff、完整文档、终端全文、环境变量、凭证、cookie、绝对用户路径、隐藏推理字段。Provider response 永远是 untrusted input。

不跨 provider 自动 fallback；timeout、429、预算、HTTP 或坏 JSON 都回到 raw-only并发出 `summary.failed`。Registry 在 2026-08-03 记录 `gpt-5.6-sol`、`deepseek-v4-flash/pro` 价格来源；worker 记录显式 model、request/response hash、token/cost 和 egress report。仓库验收未配置 key，因而没有付费调用证据。
