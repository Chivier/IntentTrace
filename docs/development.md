---
status: current
owner: maintainers
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0-Gate 5
---

# 开发

本文覆盖开发环境、贡献流程、仓库布局与质量/发布过程。四节按“先跑起来、再提交、再定位代码、最后过门禁”的顺序排列。

## 开始开发

要求 Linux x86_64、Node `24.18.1`、pnpm `11.18.0`（Corepack）、Docker/Compose。不要复制真实 provider key 或 session。

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install --frozen-lockfile
pnpm docker:up
pnpm docker:url
pnpm demo:load
```

默认全栈全部运行在 Docker 中，命令打印唯一的动态 loopback Web 地址。`demo:load` 只导入固定 seed 合成 fixture。Collector 先用 `… dev discover --source … --path …` 在显式授权根内返回 versioned、默认无 prompt 正文的 catalog，再用 `… dev import --source … --path … --session <opaque-id> --api <web-origin>` 精确导入；`--session` 可重复。它不会自动扫描 home，默认拒绝每层 symlink，并把完整 preflight 后的归一化事件发到 Web 内部代理。无选择器的原批量 import 仍保留。

API 和 PostgreSQL 只通过 Compose project-scoped private network（默认项目为 `intenttrace_default`）及服务 DNS 名互联，容器内部端口分别为 3001 和 5432，宿主没有对应 listener。默认栈只有 `postgres` 与共用同一应用镜像的 api/worker/web/migrate。不同 `-p` 项目拥有独立 network/volume，避免桌面壳、干净验收栈与开发栈之间的同名 DNS 污染。只有确需调试宿主进程时才使用显式、临时的 Compose override；不得把固定数据库端口重新加入默认拓扑。

源码检查与构建仍可在宿主运行。备份使用 `pnpm backup -- <dir>`，恢复演练使用 `pnpm backup:verify -- <dir>`。macOS 壳运行 `pnpm desktop:prepare`，真正 DMG 只能在 macOS 执行 `pnpm desktop:build`。提交前执行 AGENTS/CI 的完整质量命令。

## 贡献流程

项目采用 GNU AGPL v3.0 only（SPDX：`AGPL-3.0-only`），并使用 Developer Certificate of Origin 1.1；贡献者通过 `git commit -s` 声明有权按项目许可证提交贡献。分支/提交聚焦一个可审阅边界。设计决策先写或更新 ADR，行为变更先补 contract/fixture，再实现；依赖升级独立提交并记录许可证与 migration 影响。根目录 `CONTRIBUTING.md` 是面向外部贡献者的完整流程。

PR 描述分开写 implemented、automated verified、environment verified、deferred、blocked。不得把静态检查、mock fixture、Compose smoke 或真实 provider/用户环境证据混为一谈。截图只能证明所示界面，不证明后端语义正确。

安全问题走根目录 `SECURITY.md`；不要在 issue/fixture 粘贴 key、真实 session、完整终端日志或未匿名代码。

## 仓库指南

`apps/web` 是状态页和 Trace Workbench，`apps/api` 是 Fastify REST/OTLP/SSE，`apps/worker` 是异步语义 pipeline，`apps/collector` 是显式路径 CLI，`apps/desktop` 是 Tauri Docker 启动壳。共享包按依赖方向分层：schema/config → db/storage/ingest/adapters → summarizer/reducer/layout/ui/fixtures。App 可以组合 package；低层 package 不依赖 app。

`docs/design/source` 只保存历史输入；`generated/` JSON Schema、OpenAPI 和 Drizzle migration 属于需要提交的产物。`infra` 保存 Compose、多阶段 Dockerfile 和 image lock。真实 `.env`、session、artifact volume 和 provider key 永不提交。

修改契约时同时更新代码、测试、生成物和相应规范文档。不要把 prototype HTML/CSS 复制到 Next；重建组件时以 accessibility 和真实状态为准。

## 质量与发布过程

本地/CI 顺序：frozen install → production dependency audit → format → lint → typecheck → unit → contract → e2e → build → docs → schema drift → Compose config/smoke → migrate twice。失败不得进入下一 Gate。生成物必须在检查前重新生成并保持工作树无 drift。

证据等级分为 authored-unexecuted、automated-verified、environment-verified、release-verified。只有在目标 Linux、锁定 Compose images、健康端点、备份恢复与 acceptance matrix 全部通过后才能声明 release-ready；fixture/mock 不能证明 provider 或真实用户 trace。

发布版本记录 schema/migration、image digests、Node/pnpm/lockfile、commit、命令和已知限制。首发明确 single-host、非 HA、loopback。
