---
status: accepted
owner: security
last_reviewed: 2026-08-04
normative: true
milestone: Gate 0-Gate 5
---

# 数据处理

只采集操作员显式导入的 trace。API 不扫描目录，Collector 不扫描 home；Collector 读取显式文件/目录的一层 regular file，拒绝 symlink 边界，并以 realpath/file identity/offset/prefix hash 跟踪。Raw payload 与大 artifact 默认留在内容寻址本地 volume，数据库保存 hash/ref 和最小 metadata。

日志禁止 Authorization/cookie/provider key、payload 正文、完整 prompt/response。UI 以 React text 呈现不可信字段；artifact 设置 attachment、nosniff 和 sandbox CSP，HTML/SVG 强制 octet-stream。Provider egress 在发送前做 event cap 与 secret redaction，数据库只留 hash、usage/cost 和 report。

本地 session 也遵循内容边界：可见 user/assistant message 与 tool call/result 可进入 raw artifact；Codex reasoning/encrypted blocks、Claude thinking/signature、系统 instruction/world-state/file-history snapshot 在 adapter 层删除，不能仅依赖 UI 隐藏。Omission 只输出类型、行号和计数 warning，不输出被删除正文。

Fixture 必须合成或不可逆匿名化，保留 provenance manifest。`.env`、artifact volume、数据库 dump、真实 Codex/Claude session 不进 Git；真实文件路径、session ID 和对话正文也不写入 progress 证据。备份加访问控制；当前本地 demo 未实现加密-at-rest，使用者必须依赖主机/volume 权限。
