# IntentTrace

English | [简体中文](README.zh-CN.md)

[![CI](https://github.com/chivier/IntentTrace/actions/workflows/ci.yml/badge.svg)](https://github.com/chivier/IntentTrace/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24-5FA04E.svg)](.node-version)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1-6BA539.svg)](docs/contracts/api/openapi.yaml)

IntentTrace is a local-first agent-observability workbench that turns multi-agent execution traces into a replayable, evidence-backed intent graph while keeping every raw execution event as an immutable, append-only fact.

The raw layer is the record; the semantic layer is derived from it. A model may only propose a patch, and a deterministic reducer decides whether that patch becomes a revision. Nothing leaves the machine by default: the whole stack sits behind a single loopback port, and the semantic pipeline ships with a deterministic mock provider, so the graph can be built with no cloud model at all.

> [!WARNING]
> **Project stage: Local MVP.** IntentTrace targets a single developer-controlled host: no authentication, not multi-tenant, not highly available, and the only host entry point is bound to `127.0.0.1`. Cloud models are off by default, and the mock semantic pipeline runs in a fully offline environment.

![IntentTrace workbench: Intent Graph, Agent Gantt and Evidence inspector](docs/assets/workbench.png)

The screenshots in this README — the workbench above and the [trace list](docs/assets/trace-list.png) — are captured from the recorded demo trace described in [Demo: six agents, one olympiad problem](#demo-six-agents-one-olympiad-problem): a real agent run, redacted at record time. Reproduce them with `pnpm screenshots:readme` once the stack is up and `pnpm demo:load` has run; the script serves only the demo trace, so other local traces cannot enter a screenshot.

## Why IntentTrace

- **Raw facts are immutable.** Raw execution events are append-only and are never overwritten by model output. See [system invariants](docs/architecture.md#system-invariants).
- **Semantic conclusions stay traceable.** Every claim resolves back to a raw event or to artifact evidence. See [the artifact and evidence contract](docs/contracts.md#artifact-and-evidence-contract).
- **Replay against the information available then.** Graph, Gantt, raw events and evidence share one ingest watermark. See [data flow](docs/architecture.md#data-flow-and-ordering).
- **A deterministic commit boundary.** The model only proposes; Zod validation and a deterministic reducer decide whether a revision is committed. See [the reducer contract](docs/contracts.md#reducer-contract).
- **Several ways in.** Canonical JSONL, OTLP HTTP JSON/gzip, and Codex/Claude sessions from explicitly chosen files. See [the adapter contract](docs/contracts.md#adapter-contract).
- **Local-first, degrading instead of failing.** When the provider is unavailable, the raw trace and evidence paths keep working. See [the provider outage runbook](docs/operations/runbooks.md#runbook-provider-outage).
- **Human revisions.** Edit, pin and feedback, with an immutable revision history preserved. See [the revision model](docs/contracts.md#revision-model).

## Quick start

Requirements:

- Linux x86_64 (the currently verified Compose target)
- Node.js `24.18.1` with Corepack
- pnpm `11.18.0`
- Docker Engine and Docker Compose v2

macOS 12+ can run the stack through Docker Desktop; the Tauri DMG still needs Apple codesigning and notarization before it counts as a distribution artifact. Windows is not a verified platform.

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
pnpm install --frozen-lockfile
pnpm docker:up
pnpm demo:load
pnpm docker:url
```

Open the `/traces` page at the origin that `pnpm docker:url` prints. `demo:load` replays a recorded real agent run of 231 events; ingestion is content-addressed, so re-running it inserts nothing new. The fixed-seed synthetic acceptance fixture is still one command away: `pnpm demo:load:synthetic`.

Only Web is published, on an automatically allocated `127.0.0.1` ephemeral port; the API, PostgreSQL and the worker are reachable only inside the Compose private network. The whole stack is two images: `postgres`, plus one application image shared by the api, worker, web and migrate services. When a stable Web port is required:

```bash
INTENTTRACE_WEB_PORT=13000 pnpm docker:up
```

Everyday operations:

```bash
pnpm docker:status   # service health
pnpm docker:url      # current dynamic Web address
pnpm docker:down     # stop services, keep named volumes
```

These commands target the root `docker-compose.yml`; direct Docker Compose commands remain available when needed.

## Demo: six agents, one olympiad problem

`pnpm demo:load` replays a recording of a real run: one orchestrator and five specialist agents solving IMO 2025 Problem 1 in parallel — 231 raw events, six agent lanes, 24 minutes of wall clock, eight failed tool calls. It is a recording, not a simulation. Every event comes from that run's session transcripts; hidden reasoning blocks were dropped at record time and never stored, and host paths were stripped before the file was committed.

The run went wrong in a way a chat log hides well. Three specialists — constructions, impossibility, verification — had no `eval`, `write` or `bash` tool, so they could not run a single check; they said so, continued by hand, and the orchestrator executed their scripts instead. The final answer (`k ∈ {0, 1, 3}`) is correct, which is exactly why the interesting question is _which agent's claim is actually backed by evidence_.

Open the trace and read it top-down:

1. **Agent Gantt** — six lanes, three of them overlapping through the first wave. That is the parallelism itself, not a description of it.
2. **Intent Graph** — six nodes on the recorded revision. Three are `Issue` cards whose titles are literal tool failures (`Tool result: eval · Tool eval not found`), so a blocked agent is visible before you read a single message.
3. **Evidence inspector** — select a node: every claim lists the raw events it came from with `#ingestSeq`, kind and agent, and `Open sanitized source payload` serves the stored tool arguments or output behind it.
4. **Replay controls** — drag `Known at ingest watermark` back to 100 and the panels answer what was known then: `Raw Events` drops to 100 facts, the `eval` failure still cites `#50`, and the closing result node's evidence rows read `outside playhead` — the conclusion is on screen, the facts supporting it had not arrived yet.
5. **Raw Events** — 231 immutable facts. The graph is derived from them; nothing above can rewrite them.

The two screenshots above come from exactly this trace.

## Importing traces

Two entry points, one boundary: nothing is read until you hand the bytes over explicitly, and no server-side component ever enumerates a directory.

**From the browser.** Open `/import` and drop files, pick files, or pick a folder. IntentTrace reads only the first 64 KiB of each candidate to detect its source, title and project hint, ranks at most 50 candidates by modification time, and flags the ones already imported. Prompt previews stay hidden until you turn them on. Uploads are capped by `IMPORT_UPLOAD_MAX_BYTES`, 64 MiB by default.

**From the CLI**, for headless and bulk imports. Discovery sends nothing to the API and prints no paths, file names or native session IDs; you copy an opaque catalog ID out of it and import that:

```bash
WEB_ORIGIN="$(pnpm --silent docker:url | awk '/IntentTrace Web:/ { print $3 }')"

# 1. Discover recent sessions
pnpm --filter @intenttrace/collector dev discover \
  --source codex --path ~/.codex/sessions --limit 50

# 2. Import the ones you chose; --session may be repeated
pnpm --filter @intenttrace/collector dev import \
  --source codex --path ~/.codex/sessions \
  --session "paste-24-character-catalog-id" --api "$WEB_ORIGIN"
```

Both paths run the same whole-file adapter and Zod preflight before the first raw fact is sent, drop the same content at the adapter level (Codex `reasoning` and `encrypted_content` blocks, Claude `thinking` and `redacted_thinking` blocks, system instructions, and internal world-state and file-history snapshots), and derive the same content-hash completion marker, so a browser import and a CLI import of the same file are mutually idempotent. The opaque catalog ID scheme, the `O_NOFOLLOW` preflight, the 64 MiB per-file default and `--max-file-mib`, the loopback-only `--api` restriction, the bulk flags (`--newest`, `--max-files`, `--concurrency`, `--dry-run`) and the `--include-previews` consent flag are documented in [the import experience research](docs/design/research/import-experience.md#intenttrace-目标体验) and in [data handling](docs/security.md#data-handling).

## Architecture

```text
Explicit files / browser upload / OTLP
        │
        ▼
Adapters ──► Web loopback proxy ──► API ──► PostgreSQL raw facts
                                      │              │
                                      │              └─► durable SSE/outbox
                                      ▼
                             summary_jobs worker
                                      │
                         proposal → Zod → reducer
                                      │
                                      ▼
                          immutable semantic revisions
                                      │
                                      ▼
                        Graph / Gantt / Evidence UI
```

Core boundaries:

1. Zod schemas are the authoring source for domain contracts; the Drizzle schema and its migrations are the persistence source.
2. A raw event is an append-only fact; the semantic graph is revisioned derived data.
3. User intent, agent intention, observed action and outcome are modelled separately.
4. A provider returns only proposals; a deterministic reducer validates and commits them.
5. The system does not reconstruct, store or display hidden chain-of-thought.

Details: [architecture overview](docs/architecture.md#architecture-overview), [data flow and ordering](docs/architecture.md#data-flow-and-ordering), [ADR index](docs/decisions.md#adr-index).

## Documentation

| Document                                               | Covers                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| [`docs/architecture.md`](docs/architecture.md)         | Overview, system invariants, data flow and ordering             |
| [`docs/decisions.md`](docs/decisions.md)               | All 14 ADRs and the ADR index                                   |
| [`docs/contracts.md`](docs/contracts.md)               | Domain model, idempotency, reducer, artifact, adapter contracts |
| [`docs/contracts/api.md`](docs/contracts/api.md)       | API design, error codes, SSE protocol, generated OpenAPI        |
| [`docs/security.md`](docs/security.md)                 | Threat model, data handling, provider egress policy             |
| [`docs/operations.md`](docs/operations.md)             | Deployment, observability, backup and restore, macOS shell      |
| [`docs/development.md`](docs/development.md)           | Environment, contribution flow, repository guide, gates         |
| [`docs/reference.md`](docs/reference.md)               | Every configuration key, and the glossary                       |
| [`docs/project/progress.md`](docs/project/progress.md) | Progress with commands, commits and environment evidence        |

Full navigation, including testing, database, product spec and research notes: [`docs/README.md`](docs/README.md).

> [!NOTE]
> `docs/` is in English, except the project records under `docs/project/` and the design and research notes under `docs/design/`, which are still in Chinese.

## Telemetry and data egress

**IntentTrace's own code collects no telemetry.** There is no analytics client, crash reporter or usage ping anywhere in the tree, and IntentTrace itself reports nothing at install, start or run time.

**Its build tools do ship telemetry, enabled by default, and the stack disables it.** `pnpm build` is `turbo run build`, so `NEXT_TELEMETRY_DISABLED=1` and `TURBO_TELEMETRY_DISABLED=1` are set in `infra/Dockerfile`, `docker-compose.yml` and the CI workflow — the quick start above therefore sends nothing to Vercel. Running `pnpm build`, `pnpm dev` or `pnpm typecheck` on the host instead of through Docker is subject to both vendors' defaults; export the same two variables to opt out there too. See [data handling](docs/security.md#data-handling) for the vendors' own opt-out commands and their caveat.

**Cloud provider egress is off by default.** `PROVIDER_MODE` defaults to `mock` and `PROVIDER_EGRESS_ENABLED` defaults to `false`, which is also what the test suite runs against.

Selecting `PROVIDER_MODE=openai` or `PROVIDER_MODE=deepseek` makes configuration loading fail unless every gate is satisfied at once: `PROVIDER_EGRESS_ENABLED=true`, a positive `PROVIDER_DAILY_BUDGET_USD` (default `0`), an API key, an explicit model, and a base URL whose host is exactly `api.openai.com` or `api.deepseek.com`. Only then may the worker send a deterministic event sketch, truncated to `PROVIDER_MAX_EVENTS` events (default `256`) and redacted, under a `PROVIDER_TIMEOUT_MS` timeout (default `30000`). Source text, complete documents, whole terminal logs, environment variables, credentials and absolute user paths are never sent; provider responses are treated as untrusted input; and a timeout, an HTTP 429, an exhausted budget or malformed JSON falls back to the raw-only path rather than to another provider. Prompt and response bodies are never persisted — only the model, hashes, token counts, cost and a redaction report are.

The full boundary is in [security](docs/security.md#provider-egress-policy); every configuration key and its default is in [reference](docs/reference.md#configuration-reference).

## Current limitations

- The release boundary is a local single-host MVP: no auth or RBAC, no multi-tenancy, no HA, no public SaaS.
- The OpenAI and DeepSeek adapters are implemented, but real-provider quality and cost have not completed public release qualification.
- Performance figures are synthetic smoke tests and single-host observations, not a production SLA.
- The macOS universal DMG workflow exists, but a real artifact still needs Apple signing, notarization and install verification.
- OTLP gRPC, run comparison and mobile clients remain out of scope.

Strict evidence for what is implemented, verified or blocked: [`docs/project/progress.md`](docs/project/progress.md) and [`docs/project/readiness.md`](docs/project/readiness.md#发布就绪).

## Community and support

- **Bug reports and feature requests** — [GitHub Issues](https://github.com/chivier/IntentTrace/issues). Best for: reproducible defects and scoped proposals with an expected-versus-actual description.
- **Usage questions** — [the support guide](.github/SUPPORT.md). Best for: setup, Docker and import problems that are not defects.
- **Security reports** — follow the [security policy](.github/SECURITY.md) and report privately; never open a public issue. Best for: anything that weakens the boundaries described in [security](docs/security.md#threat-model).

Never paste API keys, real trace payloads, session logs or private source code into a public issue.

## Contributing

Bug reports, documentation improvements, adapter fixtures, accessibility fixes and small pull requests are welcome. A behavioural or contract change must update the schema, migration, OpenAPI, tests and docs together, and model output must never overwrite raw facts. Contributions are offered under the project licence, declared with `git commit -s` (Developer Certificate of Origin 1.1).

Start with [the contributor guide](.github/CONTRIBUTING.md), [the contribution flow](docs/development.md#contribution-flow), and [the repository guide](docs/development.md#repository-guide). The mandatory local and CI gate sequence is listed in [quality and release process](docs/development.md#quality-and-release-process).

## License

IntentTrace is licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (SPDX: `AGPL-3.0-only`). If you modify IntentTrace and offer it to users over a network, AGPL section 13 requires you to offer those users the corresponding source. Third-party dependencies and the self-hosted Inter font keep their own licences; review [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and the matching dependency licence texts before distributing or deploying.
