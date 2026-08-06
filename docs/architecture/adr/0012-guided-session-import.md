---
status: accepted
owner: ingestion
last_reviewed: 2026-08-06
normative: true
milestone: post-Gate 5 import UX
---

# ADR 0012：显式授权根内的两阶段会话导入

## 背景

ADR 0011 建立了不可突破的权限边界：API 不读取宿主目录，Collector 只处理操作者显式命名的 path。后续实际使用发现，仅把目录中的文件批量导入或用 `--dry-run` 列文件名不足以支持数百个 Codex/Claude session：操作者无法在发送 raw facts 前判断会话是否可读、属于哪个项目、何时活跃，也无法稳定选择少数会话。文件末尾损坏时，边解析边发送还可能留下半导入 trace。

对 Paseo 的 provider-session import 研究表明，成熟导入流程应拆成轻量 listing 与 selected import 两阶段，并以稳定 handle、bounded descriptor、失败隔离和明确 empty/error 状态连接 CLI/UI。详细来源与差异分析见 [`../../design/import-experience-research.md`](../../design/import-experience-research.md)。

## 决定

1. **权限边界不变**：API/worker/Web server 不扫描宿主文件系统；Collector 不自动读取 home。Collector 的 ingestion origin 在 local MVP 只允许 `localhost`、IPv4 `127.0.0.0/8` 或 IPv6 `::1`，防止误配置把 raw session 发往远端。每次 discovery/import 必须有操作者显式命名的 regular file 或 directory root，每层拒绝 symlink。
2. **两阶段协议**：
   - `discover` 在授权根内生成 versioned `SessionCatalog`，不联系 API、不写 checkpoint、不发送 raw facts；
   - `import --session <opaque-id>` 可重复指定 catalog ID，只导入被选择的 candidate，不以 native path/session ID 作为公开选择器，也不在 import 时重新执行内容搜索。
3. **catalog 最小披露**：默认 descriptor 只包含 opaque ID、source、generic title、project basename hint、activity/mtime、byte/event/warning counts；绝对路径、根内相对路径、文件名和 native session ID 不进入 stdout。只有 `--include-previews` 明确 opt-in 后才输出 bounded visible first/last prompt preview 与内容标题；hidden reasoning/thinking 永不进入 catalog。
4. **stale selection fail-visible**：opaque ID 绑定 source、授权 root、root-relative placement、size、mtime 和 file identity 的本地选择上下文。候选变化后旧 ID 不匹配，必须刷新 catalog；禁止旧 preview 静默指向变化后的文件。
5. **完整 preflight**：每个文件必须在发送第一条 raw fact 前完成 adapter parse、隐私 omission 和 Zod validation。 malformed/unsupported/visible-event-empty candidate 发送 0 events；同批其他文件继续。stat/realpath/race/越界 candidate 计入 `rejectedFiles` 并让命令非零退出，不能静默消失。API 在单文件发送过程中失败仍可能留下前缀 raw facts，这些是不可覆盖的已观察事实，重试依靠 source identity 幂等补齐。
6. **有界资源**：先以最多 32 并发读取 metadata，对全部 candidate 排序并裁剪 limit，再只检查 recent/selected window；discovery 只保留 descriptor，import 按 bounded concurrency 逐文件 preflight→send，内存上界由 concurrency 与单文件大小决定，不由目录总文件数决定。单文件默认上限 64 MiB，可用 `--max-file-mib` 显式调整，超限 candidate 在读取前失败。
7. **契约来源**：`SessionCatalogSchema`、`SessionImportOutcomeSchema` 与 `SessionImportSummarySchema` 位于 `packages/schema`，生成 JSON Schema；catalog、逐会话成功结果和聚合 summary 在写 stdout 前必须通过 schema。未来 Tauri/Web picker 只能消费该 catalog/progress 协议，不得绕过 Collector 让 API 扫目录。
8. **兼容性**：现有无 `--session` 批量 import、`--max-files`、`--newest`、`--concurrency`、`--dry-run` 和单文件 `follow` 保留。`dry-run` 升级为完整 preflight catalog，但默认不输出 prompt preview。

## 后果

优点：导入前可验证、可选择、可脚本化；坏文件不会产生 adapter-level 半导入；stdout 默认不泄露 home path/native ID/prompt；未来图形 picker 有稳定契约。代价：discovery 会读取并解析 limit 内候选，较纯 `stat` 慢；catalog ID 是本地授权根作用域内的短期 selector，不是持久 domain identity；单文件 API 发送仍不是跨事件原子事务。

ADR 0012 替代 ADR 0011 中“一层 regular files/只有直接 import”的实现限制，但不替代其独立 Collector、显式授权、API 不读宿主目录和 symlink 拒绝结论。
