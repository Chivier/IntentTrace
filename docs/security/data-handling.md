---
status: accepted
owner: security
last_reviewed: 2026-08-03
normative: true
milestone: Gate 0-Gate 5
---

# 数据处理

只采集操作员显式导入的 trace。API 不扫描目录，Collector 不扫描 home；Collector 读取显式文件/目录的一层 regular file，拒绝 symlink 边界，并以 realpath/file identity/offset/prefix hash 跟踪。Raw payload 与大 artifact 默认留在内容寻址本地 volume，数据库保存 hash/ref 和最小 metadata。

日志禁止 Authorization/cookie/provider key、payload 正文、完整 prompt/response。UI 以 React text 呈现不可信字段；artifact 设置 attachment、nosniff 和 sandbox CSP，HTML/SVG 强制 octet-stream。Provider egress 在发送前做 event cap 与 secret redaction，数据库只留 hash、usage/cost 和 report。

Fixture 必须合成或不可逆匿名化，保留 provenance manifest。`.env`、artifact volume、数据库 dump、Codex/Claude session 不进 Git。备份加访问控制；当前本地 demo 未实现加密-at-rest，使用者必须依赖主机/volume 权限。
