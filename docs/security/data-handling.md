---
status: accepted
owner: security
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# 数据处理

只采集操作员显式导入的 trace。API 不扫描目录，Collector 不扫描 home；Gate 0 路径 validator 不读取文件内容。Raw payload 与大 artifact 默认留在内容寻址本地 volume，数据库保存 hash/ref 和最小 metadata。

日志禁止 Authorization/cookie/provider key、payload 正文、完整 prompt/response、真实绝对 session 路径。UI 将 message、tool output、HTML、SVG、Markdown 当不可信文本；需要富文本时使用 allowlist sanitizer 和隔离下载。

Fixture 必须合成或不可逆匿名化，保留 provenance manifest。`.env`、artifact volume、数据库 dump、Codex/Claude session 不进 Git。备份加访问控制；当前本地 demo 未实现加密-at-rest，使用者必须依赖主机/volume 权限。
