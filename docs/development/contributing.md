---
status: current
owner: maintainers
last_reviewed: 2026-08-06
normative: true
milestone: Gate 0-Gate 5
---

# 贡献流程

项目采用 GNU AGPL v3.0 only（SPDX：`AGPL-3.0-only`），并使用 Developer Certificate of Origin 1.1；贡献者通过 `git commit -s` 声明有权按项目许可证提交贡献。分支/提交聚焦一个可审阅边界。设计决策先写或更新 ADR，行为变更先补 contract/fixture，再实现；依赖升级独立提交并记录许可证与 migration 影响。根目录 [`CONTRIBUTING.md`](../../CONTRIBUTING.md) 是面向外部贡献者的完整流程。

PR 描述分开写 implemented、automated verified、environment verified、deferred、blocked。不得把静态检查、mock fixture、Compose smoke 或真实 provider/用户环境证据混为一谈。截图只能证明所示界面，不证明后端语义正确。

安全问题走根目录 `SECURITY.md`；不要在 issue/fixture 粘贴 key、真实 session、完整终端日志或未匿名代码。
