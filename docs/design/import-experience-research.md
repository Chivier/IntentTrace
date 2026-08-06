---
status: current
owner: product-design
last_reviewed: 2026-08-06
normative: true
milestone: post-Gate 5 import UX
---

# 聊天记录导入体验调研

## 调研范围与可复现性

参考项目：[getpaseo/paseo](https://github.com/getpaseo/paseo)，调研固定于 commit [`f2054cc701f4cdaa43b509331a393956bc67decc`](https://github.com/getpaseo/paseo/tree/f2054cc701f4cdaa43b509331a393956bc67decc)（2026-08-06）。Paseo 根 `LICENSE` 声明项目主体为 AGPLv3；IntentTrace 也是 `AGPL-3.0-only`。本次实现没有复制 Paseo 源文件或 UI 代码，只借鉴公开的交互/边界模式，并在本仓库重新实现。

重点阅读：

- [`packages/server/src/server/agent/import-sessions.ts`](https://github.com/getpaseo/paseo/blob/f2054cc701f4cdaa43b509331a393956bc67decc/packages/server/src/server/agent/import-sessions.ts)：listing/filter/sort/already-imported/selected import 边界；
- [`provider-session-import.ts`](https://github.com/getpaseo/paseo/blob/f2054cc701f4cdaa43b509331a393956bc67decc/packages/server/src/server/agent/provider-session-import.ts)：selected handle resume 后完整 history hydration；
- [`agent-sdk-types.ts`](https://github.com/getpaseo/paseo/blob/f2054cc701f4cdaa43b509331a393956bc67decc/packages/server/src/server/agent/agent-sdk-types.ts)：`ImportableProviderSession` 最小 descriptor；
- Claude `listImportableSessions`/`parseClaudeSessionDescriptor`：候选 overscan、首 prompt/cwd/session handle 提取；
- Codex `listImportableSessions`：优先使用 `thread/list` 的 cheap metadata，而非读完整 history；
- [`providers/pi/session-descriptor.ts`](https://github.com/getpaseo/paseo/blob/f2054cc701f4cdaa43b509331a393956bc67decc/packages/server/src/server/agent/providers/pi/session-descriptor.ts)：先按 mtime 排序、只解析 bounded recent window、head/tail bounded reads；
- [`import-session-sheet-view-model.ts`](https://github.com/getpaseo/paseo/blob/f2054cc701f4cdaa43b509331a393956bc67decc/packages/app/src/components/import-session-sheet-view-model.ts) 与 sheet：provider fan-out、dedupe、筛选、刷新、部分失败、已导入 empty state；
- [`import-session.opencode.real.spec.ts`](https://github.com/getpaseo/paseo/blob/f2054cc701f4cdaa43b509331a393956bc67decc/packages/app/e2e/browser/import-session.opencode.real.spec.ts)：真实 provider session 从 listing 到 UI import/history 可见的端到端证据。

## Paseo 的有效设计

### 1. Listing 与 import 分离

Picker listing 只返回 provider handle、cwd、title、first/last prompt preview 和 last activity。选择后 import 直接使用该 handle，不重新 listing。这样 UI 不持有完整历史，provider 能选择最便宜的 metadata 来源；只有用户选中的会话才 hydrate 完整 history。

### 2. Provider-owned discovery，统一 descriptor

Codex 使用 app-server `thread/list`；Claude/Pi/OMP 无同等 API 时读取持久化文件。不同发现方式在 provider 边界内统一为 descriptor，UI 不理解每种磁盘格式。可 pre-filter cwd 的 provider 尽早过滤，顶层再用 realpath-aware matcher 复核。

### 3. 有界近期窗口

Pi 先遍历文件并按 mtime 排序，只解析 recent candidate window；head/tail 使用 byte cap，避免为了显示 20 行而完整解析所有历史。Claude 也 overscan 后裁剪。这对数百/数千会话目录比“全部完整 parse 后排序”更可靠。

### 4. 失败隔离与显式状态

多 provider listing fan-out 时一个 provider 失败不清空其他结果；UI 区分全部失败、部分失败、loading、没有 provider、没有 recent session、全部已导入、当前 filter 无结果。刷新是显式动作，不做隐藏轮询。

### 5. 重复与并发导入

Paseo 按 provider + providerHandle 过滤 active imported rows；导入 mutation 按 handle 串行化，再次导入 active owner 明确失败。archived session 有独立 restore/rollback 语义。selected import 完整 hydrate 后才发布 ready。

## 不直接采用的部分

| Paseo 行为                                        | IntentTrace 决定                                                                        | 原因                                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| daemon 可从默认 provider home 发现 sessions       | 必须由 Collector 接收显式 `--path` 授权根                                               | API 无 auth 且 Compose 内不可访问宿主 home；ADR 0011 安全边界不可突破            |
| descriptor 默认携带 cwd/native provider handle    | stdout 只给 project basename hint 与 opaque catalog ID                                  | 真实绝对路径和 native session ID 不得进入日志/文档；选择器不应泄露身份           |
| picker 默认显示 prompt previews                   | CLI 默认不显示，只有 `--include-previews` opt-in                                        | stdout/CI log 比受控 app sheet 更容易长期留存 payload 正文                       |
| import 的目标是可继续运行的 provider agent        | import 的目标是 immutable raw facts + derived semantic revisions                        | IntentTrace 不恢复执行权限，也不让 provider history 替代 raw ingestion authority |
| archived agent 可 reimport/restore                | raw facts始终幂等 append，semantic revision另行派生                                     | IntentTrace 没有 provider agent ownership 生命周期                               |
| provider process API 优先（如 Codex thread/list） | 当前仍解析显式文件；未来可新增 provider metadata helper，但不能读取 auth 或恢复 session | Collector 应保持离线、无 provider egress、无执行权限                             |

## IntentTrace 目标体验

### CLI v1（本次实现）

```bash
# 默认 catalog 不输出 prompt 正文
intenttrace discover --source codex --path ~/.codex/sessions --limit 50

# 操作者显式同意后显示 bounded visible preview
intenttrace discover --source codex --path ~/.codex/sessions --limit 50 --include-previews

# 精确选择，可重复 --session
SESSION_ID_1="paste-24-character-catalog-id"
SESSION_ID_2="paste-24-character-catalog-id"
intenttrace import --source codex --path ~/.codex/sessions \
  --session "$SESSION_ID_1" --session "$SESSION_ID_2" --api "$WEB_ORIGIN"
```

`SessionCatalog` version 1 包含：opaque ID、source、generic/preview title、project hint、first/last preview、last activity、mtime、bytes、event/warning counts、typed failed candidates、limit/unreadable/missing counts。绝对 path、relative path、file name、native session ID 不进入输出。ID 绑定授权 root、placement、inode/size/mtime，preflight 以 `O_NOFOLLOW` open 并在 read 前后复核，文件改变后旧 ID fail-visible。默认单文件上限 64 MiB。每个成功 import 另发 schema-validated path-free outcome（含 trace ID/inserted/duplicates/warnings），最后发聚合 summary，便于未来 UI 跳转与 retry-failed。

### 图形导入器（后续，不伪装为已实现）

Tauri/本机 helper 调用同一 Collector catalog 协议，UI 采用三步：选择 source 与授权根 → 查看 recent catalog/勾选 → 导入进度与逐条结果。需要 provider chips、project/time/search filters、preview consent toggle、partial failure/rejected-file banner、refresh 与 retry-failed。already-imported 状态必须由新增的 API/DB 批量查询 source/trace identity 后返回，不能依赖 Collector 本地 ledger；该接口本轮未实现。Web server 不能自行扫描目录；普通浏览器环境没有安全的任意目录持久访问能力时，应继续展示可复制 CLI 命令，而不是假造 file picker 权限。

## 验收维度

- 目录 1,000+ 文件时先 metadata sort，再只 parse limit/selected candidates；
- discovery 发起 0 个 API 请求；默认 stdout 不包含授权 root、cwd、relative path、native session ID、文件名或 prompt；
- preview 只来自 adapter 已允许的 visible user content，长度不超过 160；
- malformed tail 在发送第一条 event 前被发现，该 candidate 插入数为 0；
- stale/unknown catalog ID 不回退到全量 import；
- batch 中一个 candidate 失败不阻止其他 candidate；
- 同文件重试保持 raw identity 幂等，completion marker 仍由 content hash 派生；
- future UI 的截图/自动化只能使用 synthetic fixtures。
