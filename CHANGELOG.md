# Changelog

All notable project changes are recorded here. The project has no public release yet.

## Unreleased

- Initialize the Gate 0 engineering and documentation foundation.
- Implement Gate 1 canonical JSONL, OTLP JSON/gzip, Codex and Claude adapters plus import/follow checkpoints and a deterministic 2,048-event fixture.
- Implement Gate 2 raw trace list/inspector, Agent Gantt, replay watermark, evidence artifact ranges and durable resumable SSE.
- Implement Gate 3 immutable semantic revisions, deterministic reducer, mock summarization, BullMQ recovery, React Flow and ELK worker layout.
- Implement Gate 4 redaction, provider egress gates, local schema validation, OpenAI Responses and DeepSeek JSON adapters; cloud egress remains opt-in.
- Implement Gate 5 human pin/feedback revisions, deletion confirmation, backup/restore drills, synthetic scale smoke and accessibility checks.
- Add a Tauri 2 macOS Docker-service launcher and macOS universal DMG workflow; signing/notarization requires external Apple credentials.
- Override transitive dependencies to `postcss 8.5.25` and `sharp 0.35.0`; the production dependency audit reports no known vulnerabilities.
- Validate explicit local Codex/Claude imports, omit hidden reasoning/thinking and internal snapshots before persistence, distinguish CLI versions from source format versions, and add content-hash completion markers for offline imports.
- Replace structural Codex/Claude placeholders with readable visible-content previews, omit thinking-only events, preserve full sanitized payload inspection, bound summary jobs to their own chunks, paginate the complete raw event set, and throttle SSE replay refreshes.
