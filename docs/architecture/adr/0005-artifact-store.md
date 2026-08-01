---
status: accepted
owner: architecture
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# ADR 0005：内容寻址 ArtifactStore

决定：大对象使用 SHA-256 内容寻址，默认存在本地 named volume。公共接口固定 `put`、`stat`、`getRange`、`deleteTrace`，后续可加 S3 adapter。MinIO 因分发与维护状态不作为默认依赖。数据库只保留 hash、长度、media type 与 ref；删除以 trace 为隔离单位。
