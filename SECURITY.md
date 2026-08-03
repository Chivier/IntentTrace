# Security Policy

IntentTrace is a local-only single-user MVP and must bind its only published service to `127.0.0.1`. Do not expose it to an untrusted network; it has no authentication or multi-tenant isolation.

Report suspected vulnerabilities privately to the repository owner. Do not place secrets, real trace payloads, `.env` files, provider prompts, or session logs in issues, fixtures, telemetry, or commits. Provider egress is disabled by default and requires the documented configuration, allowlist, budget and redaction gates.

See `docs/security/` for the threat model, data handling, and provider egress policy.
