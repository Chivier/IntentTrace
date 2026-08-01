---
status: accepted
owner: architecture
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0
---

# ADR 0002：契约事实源

决定：Zod 是领域/API schema 唯一源，Drizzle 与已提交 migration 是持久化事实源；JSON Schema/OpenAPI 必须由代码生成并通过 drift 检查。Accepted ADR 解释无法由类型表达的规则。历史 JSON Schema 不直接参与运行时校验，避免手写副本分叉。
