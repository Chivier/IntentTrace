---
status: accepted
owner: maintainers
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# 兼容性策略

Envelope、patch、checkpoint、SSE 和公开 API 均有显式版本。增加 optional 字段属于同 minor；改变语义、required 字段或 enum 删除需新 major 和 migration/adapter。读取器必须拒绝未知 major，未知 minor 字段可在 schema 允许时忽略并保留原 payload ref。

依赖全部精确版本，lockfile 由 CI frozen 安装。升级单独提交，必须通过 typecheck、migration 空库/重复运行、schema drift、fixtures、许可证与 Compose smoke。生成 JSON Schema/OpenAPI 属于提交产物；源码与生成物不一致时 CI 失败。

第一发布支持 Linux x86_64。Node Collector 使用可移植 API，但 macOS/Windows 在完成 fixture 与 follow/rotation 验证前不做正式支持声明。
