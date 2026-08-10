---
status: accepted
owner: security
last_reviewed: 2026-08-09
normative: true
milestone: Gate 0-Gate 5
---

# 数据处理

只采集操作员显式导入的 trace。API 不扫描目录，Collector 不主动扫描 home；Collector 只遍历显式命名的文件或目录根，递归读取 `.jsonl`/`.ndjson` regular files，每层拒绝 symlink 边界，并以 realpath/file identity/offset/prefix hash 跟踪。`discover` 发起 0 个 API 请求；实际 import/follow 的 `--api` 在 local MVP 只允许 loopback hostname/address，防止误配置 raw egress；catalog 默认不输出 prompt，且永不输出授权根、cwd、相对路径、文件名或 native session ID，只有显式 `--include-previews` 才把最长 160 字符的 visible prompt preview 写到 stdout。Raw payload 与大 artifact 默认留在内容寻址本地 volume，数据库保存 hash/ref 和最小 metadata。

日志禁止 Authorization/cookie/provider key、payload 正文、完整 prompt/response。UI 以 React text 呈现不可信字段；artifact 设置 attachment、nosniff 和 sandbox CSP，HTML/SVG 强制 octet-stream。Provider egress 在发送前做 event cap 与 secret redaction，数据库只留 hash、usage/cost 和 report。

目录 candidate 还要通过 realpath containment 与 inode/size/mtime 复核；stat/race/越界文件计入 `rejectedFiles` 并非零退出。每个本地 session 在第一条 raw fact 发送前必须完成全文件 adapter/Zod preflight；malformed/unsupported/无 visible event 的 candidate 插入 0 条并 fail-visible，不能留下 adapter-level 半导入。API 发送中途失败时，已写入的前缀仍是不可覆盖事实，重试按 source identity 幂等补齐。本地 session 也遵循内容边界：可见 user/assistant message 与 tool call/result 可进入 raw artifact；Codex reasoning/encrypted blocks、Claude thinking/signature、系统 instruction/world-state/file-history snapshot 在 adapter 层删除，不能仅依赖 UI 隐藏。Omission 只输出类型、行号和计数 warning，不输出被删除正文。

浏览器上传的字节遵守完全相同的规则：`POST /api/v1/imports/sessions` 调用与 collector 同一个 `prepareSessionBytes`，因此同样的 adapter omission（Codex reasoning/encrypted blocks、Claude thinking/signature、系统 instruction/world-state/file-history snapshot）在写库前生效，同样的全文件 Zod preflight 在第一条 raw fact 之前完成。上传的文件名只用于 `safeIdentifier(basename(fileName))` 派生 `sourceIdentity`——与 collector 从磁盘 basename 派生的值一致，使同一文件的两条导入路径落在同一 project——文件名本身不进入 descriptor、不写日志、不回显给客户端。候选检查默认返回 generic title 与 `null` preview，只有 `includePreviews: true` 才返回最长 160 字符的 visible prompt preview，与 CLI 的 `--include-previews` 是同一实现。

Fixture 必须合成或不可逆匿名化，保留 provenance manifest。`.env`、artifact volume、数据库 dump、真实 Codex/Claude session 不进 Git；真实文件路径、session ID 和对话正文也不写入 progress 证据。备份加访问控制；当前本地 demo 未实现加密-at-rest，使用者必须依赖主机/volume 权限。
