---
status: accepted
owner: security
last_reviewed: 2026-08-01
normative: true
milestone: Gate 0-Gate 4
---

# Provider Egress Policy

默认、测试和 Gate 0 都是 `PROVIDER_MODE=mock`、`PROVIDER_EGRESS_ENABLED=false`；配置 loader 对开启 egress fail-fast。真实 adapter 合并前必须完成字段级分类/redaction、event-sketch 最小化、prompt injection tests、域名 allowlist、key secret source、budget/timeout、审计和关闭开关。

允许发送：经 policy 版本化处理的短摘要、必要 ID 别名和结构信息。默认禁止：源码/完整 diff、完整文档、终端全文、环境变量、凭证、cookie、绝对用户路径、隐藏推理字段。Provider response 永远是 untrusted input。

不跨 provider 自动 fallback；任何网络/预算/解析失败回到 raw-only。Registry 用日期锁 model snapshot 与价格；日志只保存 request/response hash、token/cost、redaction report 和状态。用户必须显式配置才能产生网络调用。
