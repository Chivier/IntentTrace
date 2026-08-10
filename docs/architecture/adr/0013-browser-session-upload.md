---
status: accepted
owner: ingestion
last_reviewed: 2026-08-09
normative: true
milestone: post-Gate 5 import UX
---

# ADR 0013：浏览器交付的会话上传

## 背景

ADR 0012 建立的两阶段 guided import 只有 CLI 入口。Web UI 的整个导入界面是 `/traces` 空状态里一段不可复制的 `<pre>` 命令清单，操作者必须离开浏览器、拼出授权根路径、再回来刷新。同时四个 adapter 中有三个只接受行分隔 JSONL，一份整文档 `.json` session 会以 `MalformedAdapterInputError` 被拒绝。

关键区分：**操作者在浏览器里显式选择并交出的字节，不是宿主目录扫描。** 文件选择器由用户代理拥有，网页只能拿到用户主动交出的 `File`。这条边界与 ADR 0012 §1 的"API 不扫描宿主文件系统"完全兼容。

## 决定

1. **权限边界不变**：API 仍然不枚举任何目录。新增的两条路由只处理请求体里已经到达的字节，不接受路径参数，不做任何文件系统读取。ADR 0012 §1 与 §7 继续成立；服务端目录选择器仍然被禁止。
2. **共享 preflight 核心**：`packages/adapters/src/session.ts` 的 `prepareSessionBytes` 是 CLI 与上传路径唯一的解析入口——先完整 parse + Zod validate，再由调用方发出第一条 raw fact。Collector 的 `prepareSession` 保留 fs 半边（size gate、`O_NOFOLLOW`、读前读后 identity/size/mtime 复核）后委托给它。
3. **同一 trace 身份**：`buildCompletionMarker` 由文件 SHA-256 而非传输方式派生 `trace_complete` 的 `sourceEventId`。CLI 导入过的文件在浏览器重传得到 `inserted: 0`、相同 `traceId`；反向亦然。两条路径互为幂等。
4. **预览是 opt-in**：`POST /api/v1/imports/candidates` 默认返回 generic title 与 `null` preview，只有 `includePreviews: true` 才返回内容标题和 bounded first/last prompt preview，上限 160 字符，与 catalog 的 `--include-previews` 同一实现（`redactCatalogEntry`）。hidden reasoning/thinking 永不进入 candidate。
5. **有界 head 检查**：候选检查只读每个文件前 64 KiB，单请求最多 50 个候选，不完整 head 在最后一个换行处截断。检查路由不写任何东西，只发一次数据库查询（`listTracesByIds`）判断是否已导入。
6. **上传上限是配置项**：`IMPORT_UPLOAD_MAX_BYTES` 默认 64 MiB，与 collector 的 `DEFAULT_MAX_FILE_MIB` 一致。超限由 Fastify 的 `FST_ERR_CTP_BODY_TOO_LARGE` 映射为 413 `payload_too_large`，媒体类型不符映射为 415 `unsupported_media_type`——这两个此前都会错误地变成 500。
7. **容器 JSON**：`readSessionRecords` 在既有 JSONL 解析之上追加顶层数组与单个 pretty-printed 对象两个分支。JSONL 输入走第一分支，`line`/`bytes` 逐字节不变，已导入 trace 的 fallback `sourceEventId` 因此保持稳定。只有此前会抛错的输入才会到达容器分支；仍然无法解析时重新抛出原始 `parseJsonLines` 错误，collector 的 `preflight_failed` 脱敏路径不受影响。
8. **文件名只用于 sourceIdentity**：`safeIdentifier(basename(fileName))` 与 collector 从磁盘 basename 派生的值相同，因此同一文件的浏览器导入和 CLI 导入落在同一 project。文件名不进入 descriptor，也不回显到 catalog 输出。

## 后果

优点：不装 CLI 也能导入；同一文件两条路径身份一致；413/415 变成真实语义；`.json` session 不再被拒。代价：上传字节在浏览器 `File`、Next `arrayBuffer()` 和 Fastify `Buffer` 三处完整驻留内存，这是 loopback 单用户 MVP 的可接受取舍，也是上限做成配置键而非常量的原因；head 检查对超过 64 KiB 且没有换行的整文档 JSON 会报 `preflight_failed`，但该候选仍可导入，因为上传路径在完整字节上重新检测。

本 ADR 不替代 ADR 0012；它在同一权限边界内新增一个由操作者交付字节的入口。
