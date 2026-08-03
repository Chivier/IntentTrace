---
status: accepted
owner: security
last_reviewed: 2026-08-03
normative: true
milestone: Gate 4
---

# Provider Egress Policy

默认和测试都是 `PROVIDER_MODE=mock`、`PROVIDER_EGRESS_ENABLED=false`。选择 `openai|deepseek` 时，loader 同时要求 egress=true、正预算、key、明确 model，并限制 host 为 `api.openai.com` 或 `api.deepseek.com`。event-sketch 截断、secret redaction、prompt-injection data boundary、timeout、local Zod/reducer 与 raw-only failure path 均在网络前后强制执行。

允许发送：经 policy 版本化处理的短摘要、必要 ID 别名和结构信息。默认禁止：源码/完整 diff、完整文档、终端全文、环境变量、凭证、cookie、绝对用户路径、隐藏推理字段。Provider response 永远是 untrusted input。

不跨 provider 自动 fallback；timeout、429、预算、HTTP 或坏 JSON 都回到 raw-only并发出 `summary.failed`。Registry 在 2026-08-03 记录 `gpt-5.6-sol`、`deepseek-v4-flash/pro` 价格来源；worker 记录显式 model、request/response hash、token/cost 和 egress report。仓库验收未配置 key，因而没有付费调用证据。
