---
status: current
owner: maintainers
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 5
---

# 贡献流程

项目是 private/UNLICENSED；贡献不等于获得再分发许可。分支/提交聚焦一个可审阅边界。设计决策先写或更新 ADR，行为变更先补 contract/fixture，再实现；依赖升级独立提交并记录许可证与 migration 影响。

PR 描述分开写 implemented、automated verified、environment verified、deferred、blocked。不得把静态检查、mock fixture、Compose smoke 或真实 provider/用户环境证据混为一谈。截图只能证明所示界面，不证明后端语义正确。

安全问题走根目录 `SECURITY.md`；不要在 issue/fixture 粘贴 key、真实 session、完整终端日志或未匿名代码。
