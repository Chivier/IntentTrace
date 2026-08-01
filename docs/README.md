---
status: current
owner: maintainers
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# IntentTrace 文档索引

这里是工程与产品事实的入口。实现状态只认代码、migration、生成契约和带证据的 [`project/progress.md`](project/progress.md)；历史设计包与原型只用于追溯，不构成测试结果。

| 目录           | 用途                                 | 入口                                                   |
| -------------- | ------------------------------------ | ------------------------------------------------------ |
| `design`       | 原始设计、产品与交互裁决             | [`product-spec.md`](design/product-spec.md)            |
| `architecture` | 系统边界、不变量与 ADR               | [`overview.md`](architecture/overview.md)              |
| `contracts`    | 数据、reducer、adapter、API 契约     | [`domain-model.md`](contracts/domain-model.md)         |
| `database`     | ERD、约束、迁移与删除                | [`erd.md`](database/erd.md)                            |
| `development`  | 开发环境与仓库规范                   | [`getting-started.md`](development/getting-started.md) |
| `testing`      | 各层证据和验收矩阵                   | [`strategy.md`](testing/strategy.md)                   |
| `security`     | 本地威胁、数据边界与 provider egress | [`threat-model.md`](security/threat-model.md)          |
| `operations`   | 部署、可观测性、恢复和 runbook       | [`deployment.md`](operations/deployment.md)            |
| `project`      | 施工计划、里程碑、风险和进度         | [`construction-plan.md`](project/construction-plan.md) |
| `reference`    | 配置与术语                           | [`configuration.md`](reference/configuration.md)       |

事实源优先级：Zod/Drizzle/migration → 代码生成 JSON Schema/OpenAPI → Accepted ADR → product spec → 带命令、commit、环境和产物证据的 progress。低优先级文档与高优先级事实冲突时必须更新文档或新建 ADR，不能静默选择。
