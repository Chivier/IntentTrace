---
status: accepted
owner: security
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# 威胁模型

资产：用户 trace、源码/终端 artifact、provider key、数据库、semantic claim、Collector checkpoint。信任边界：宿主文件系统→Collector、Collector/OTLP→API、数据库→web、event sketch→provider、provider patch→reducer、浏览器→artifact renderer。

主要威胁：显式路径之外读取或 symlink 越界；payload 中 secret 经日志/provider 外泄；stored XSS；文档/日志 prompt injection；source ID collision 改写事实；恶意 patch 伪造 evidence/cycle/pin；SSE 越权/旧 cursor 混流；Docker 端口意外公网暴露；备份泄漏。

Gate 0 缓解：loopback ports、API 无文件读取、Collector 显式 path + symlink reject、mock-only provider、日志 redaction、schema/reducer 骨架、私有/UNLICENSED。剩余高风险在 Gate 4 前阻止真实 egress，在 Gate 5 前阻止正式发布。Loopback 不使 trace 内容可信。
