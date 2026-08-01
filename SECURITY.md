# Security Policy

IntentTrace Gate 0 is a local-only foundation and must bind published services to `127.0.0.1`. Do not expose it to an untrusted network.

Report suspected vulnerabilities privately to the repository owner. Do not place secrets, real trace payloads, `.env` files, provider prompts, or session logs in issues, fixtures, telemetry, or commits. Provider egress is disabled by default and remains out of scope until the documented security gate passes.

See `docs/security/` for the threat model, data handling, and provider egress policy.
