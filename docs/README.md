---
status: current
owner: maintainers
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0-Gate 5
---

# IntentTrace 文档索引

这里是工程与产品事实的入口。实现状态只认代码、migration、生成契约和带证据的 [`project/progress.md`](project/progress.md)；历史设计包与原型只用于追溯，不构成测试结果。

| 文档                                                                                                     | 用途                                                                    |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`design/product-spec.md`](design/product-spec.md)                                                       | 产品规格与交互规格                                                      |
| [`architecture.md`](architecture.md)                                                                     | 架构总览、系统不变量与数据流时序                                        |
| [`decisions.md`](decisions.md)                                                                           | 全部 14 条 ADR 与 ADR 索引                                              |
| [`contracts.md`](contracts.md)                                                                           | 领域模型、revision、幂等、reducer、artifact、adapter、provider 与兼容性 |
| [`contracts/api.md`](contracts/api.md)                                                                   | API 设计、错误码与 SSE 协议                                             |
| [`contracts/api/openapi.yaml`](contracts/api/openapi.yaml)                                               | 代码生成的 OpenAPI，是实际路由的事实源                                  |
| [`database.md`](database.md)                                                                             | ERD、schema 不变量、migration 与 retention/删除                         |
| [`development.md`](development.md)                                                                       | 开发环境、贡献流程、仓库指南与质量发布过程                              |
| [`operations.md`](operations.md)                                                                         | 部署、可观测性、备份恢复与 macOS 桌面壳                                 |
| [`operations/runbooks.md`](operations/runbooks.md)                                                       | Provider outage、summary 作业队列、datastore failure、SSE recovery      |
| [`security.md`](security.md)                                                                             | 威胁模型、数据处理与 provider egress policy                             |
| [`testing.md`](testing.md)                                                                               | 测试策略、验收 fixture/矩阵、property test、语义评估与性能方法          |
| [`reference.md`](reference.md)                                                                           | 配置参考与术语表                                                        |
| [`project/plan.md`](project/plan.md)                                                                     | 完整施工计划、roadmap 与 milestone 定义                                 |
| [`project/readiness.md`](project/readiness.md)                                                           | 发布就绪、风险登记与开源发布准备                                        |
| [`project/progress.md`](project/progress.md)                                                             | 带命令、commit 与环境证据的进度记录，只追加                             |
| [`design/source-package.md`](design/source-package.md)                                                   | 原始设计包登记与偏离说明                                                |
| [`design/research/import-experience.md`](design/research/import-experience.md)                           | 聊天记录导入体验外部调研                                                |
| [`design/research/slim-runtime-and-queue-removal.md`](design/research/slim-runtime-and-queue-removal.md) | 运行时瘦身与队列移除设计（改造前的历史设计记录）                        |

目录结构：`docs/` 根下是按主题合并的规范文档；`docs/contracts/api/` 保存生成的 OpenAPI；`docs/operations/`、`docs/project/`、`docs/design/` 分别保存 runbook 集合、项目记录与设计/调研文档；`docs/design/source/` 与 `docs/design/prototype/` 是历史输入，被规范扫描显式排除；`docs/assets/` 保存 README 截图。

事实源优先级：Zod/Drizzle/migration → 代码生成 JSON Schema/OpenAPI → Accepted ADR → product spec → 带命令、commit、环境和产物证据的 progress。低优先级文档与高优先级事实冲突时必须更新文档或新建 ADR，不能静默选择。公开仓库前的代码内与平台外检查见 [`project/readiness.md`](project/readiness.md#开源发布准备)。
