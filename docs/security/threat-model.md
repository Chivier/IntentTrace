---
status: accepted
owner: security
last_reviewed: 2026-08-09
normative: true
milestone: Gate 0-Gate 5
---

# 威胁模型

资产：用户 trace、源码/终端 artifact、provider key、数据库、semantic claim、Collector checkpoint。信任边界：宿主文件系统→Collector、浏览器（操作者显式选择的文件）→Web proxy→API、Collector/OTLP→API、数据库→web、event sketch→provider、provider patch→reducer、浏览器→artifact renderer。

主要威胁：显式路径之外读取或 symlink 越界；payload 中 secret 经日志/provider 外泄；stored XSS；文档/日志 prompt injection；source ID collision 改写事实；恶意 patch 伪造 evidence/cycle/pin；SSE 越权/旧 cursor 混流；Docker 端口意外公网暴露；备份泄漏。

浏览器→API 上传边界的具体威胁与缓解：字节由用户代理的文件选择器交出，网页无法自行枚举目录，服务端也不接受路径参数，因此这条边界不引入新的宿主文件系统读取能力。超大体积由 `IMPORT_UPLOAD_MAX_BYTES`（默认 64 MiB）在 Fastify content-type parser 层截断为 413，而不是耗尽内存；错误 content-type 直接 415。上传字节走与 CLI 完全相同的 adapter omission 与 Zod preflight，恶意或畸形文件在写入第一条 raw fact 之前失败，返回 422 且插入 0 条。候选检查只读前 64 KiB、只发一次批量查询、不写任何东西。文件名只用于派生 `sourceIdentity`，不进入 descriptor、不回显。prompt preview 需要 `includePreviews: true` 显式同意，且上限 160 字符。

现有缓解：动态 loopback 单入口、API 无文件读取、Collector 显式 path + symlink reject、上传体积上限与 413/415 显式映射、provider 多条件门禁和域名 allowlist、日志/egress redaction、strict schema、deterministic reducer、claim evidence allowlist、attachment artifact、确认式删除和备份 hash。剩余风险是本地无认证、主机/volume 无应用层加密、Docker Desktop 权限、上传字节在 browser/Next/Fastify 三处完整驻留内存，以及未在真实 key 环境做 provider canary；Loopback 不使 trace 内容可信。
