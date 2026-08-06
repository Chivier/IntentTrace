# Security Policy

## Supported versions

IntentTrace 尚未发布稳定版本。安全修复目前只面向 `main`；历史 commit、fork、未签名 DMG 与第三方镜像不在维护范围内。

## Reporting a vulnerability

请不要为疑似漏洞创建公开 Issue，也不要附加真实 trace、session、secret 或私有源码。

优先使用 GitHub 仓库的 **Security → Report a vulnerability**（private vulnerability reporting）。如果该入口不可用，请通过 GitHub profile 联系维护者，请求一个私密报告渠道；在建立私密渠道前，不要发送敏感复现材料。

报告建议包含：

- 受影响 commit/version 与部署方式
- 漏洞类别、影响和所需攻击条件
- 仅使用合成数据的最小复现步骤
- 建议修复或缓解方式（如有）
- 是否计划公开披露

维护者会尽力在 7 天内确认收到并给出后续协调计划，但本项目当前由志愿维护者维护，不承诺 SLA。请在修复发布或双方约定日期之前协调披露。

## Deployment boundary

IntentTrace 是 local-only single-user MVP，唯一发布服务必须绑定 `127.0.0.1`。它没有认证、多租户隔离或应用层静态加密，因此不得暴露到不可信网络。

Provider egress 默认关闭，只有满足显式 mode、域名 allowlist、正预算、超时、event cap 与 redaction gate 时才可启用。Raw trace 与 evidence 路径在 provider 不可用时仍应工作。

不要在 Issue、fixture、telemetry、commit 或普通日志中放置：

- provider keys、Authorization/cookie 或 `.env`
- 真实 trace payload、session log、database dump 或 artifact volume
- 隐藏 reasoning/thinking、内部 snapshot、完整 prompt/response
- 未匿名代码、文件路径或 session identifier

更多边界与缓解措施见 [`docs/security/`](docs/security/) 与 [`docs/security/threat-model.md`](docs/security/threat-model.md)。
