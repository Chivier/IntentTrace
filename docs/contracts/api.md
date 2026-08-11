---
status: accepted
owner: api
last_reviewed: 2026-08-10
normative: true
milestone: Gate 0-Gate 5
---

# API contract

This document covers REST/OTLP route conventions, Problem Details error codes, and the durable SSE protocol. The routes that actually exist are always governed by the generated [`api/openapi.yaml`](api/openapi.yaml); this document only describes the rules the generated artifact cannot express.

## API design

The actual routes are governed by the generated [`openapi.yaml`](api/openapi.yaml). Besides health/readiness/version/metrics, the implemented routes are event ingest, trace list/detail/delete, raw pagination, snapshot, graph revision, revision list (`GET /api/v1/traces/{traceId}/revisions`, in reverse creation-time order, so that the Live/Final switch can locate a revision), human node edit, provider-call audit, artifact range, SSE, browser session import (`POST /api/v1/imports/candidates` and `POST /api/v1/imports/sessions`), and the standard OTLP JSON receiver. `/documentation` is the local OpenAPI UI and does not count as a business API.

Business REST is uniformly under `/api/v1`; the OTLP receiver independently uses `POST /v1/traces` and returns partial success. A source identity collision returns `409 integrity_conflict`; deletion requires `confirm` to be exactly equal to the trace ID; a human edit MUST carry the current `baseRevisionId`. Pagination and SSE use a monotonic cursor; source time cannot be used to stand for "what was known at the time".

The API only accesses the database/ArtifactStore, and does not read arbitrary host paths. The two `imports/*` routes only parse the bytes that have already arrived in the request body; they accept no path parameter and enumerate no directory. `imports/candidates` inspects the bounded head of every candidate and issues a single batched trace query, and `imports/sessions` receives the whole session as `application/octet-stream` and reuses the same full preflight and the same content-hash `trace_complete` marker as the collector. Unimplemented project management, auth, gRPC, and provider registry mutation still stay in design documents only, and the generated OpenAPI MUST NOT be edited by hand.

## API errors

JSON errors use the Problem Details fields: `type`, `title`, HTTP `status`, a stable `code`, and `requestId`, and MAY add a secret-free `detail`/field errors. Clients branch on `code` and do not parse the title.

Reserved codes: `validation_failed` 400, `unsupported_source_version` 422, `unknown_source_format` 422, `no_visible_events` 422, `preflight_failed` 422, `integrity_conflict` 409, `revision_conflict` 409, `cursor_expired` 410, `payload_too_large` 413, `unsupported_media_type` 415, `provider_unavailable` 503. Unknown errors are uniformly `internal_error` 500; the log contains the internal cause, and the response contains no stack, SQL, path, or key.

`payload_too_large` 413 and `unsupported_media_type` 415 are actually emitted by `POST /api/v1/imports/sessions`: Fastify's `FST_ERR_CTP_BODY_TOO_LARGE` and `FST_ERR_CTP_INVALID_MEDIA_TYPE` are mapped explicitly in the error handler and no longer fall into `internal_error`. An upload body larger than `IMPORT_UPLOAD_MAX_BYTES` gets a 413; a missing `content-type: application/octet-stream` gets a 415. `unknown_source_format` means that none of the four adapters recognizes these bytes, and that no event was written.

OTLP partial-success follows OTLP response semantics rather than generic Problem Details; the corresponding HTTP error is used only when the entire HTTP envelope cannot be decoded.

## SSE protocol

_The source document's status is `draft`: the event families and fields may still change, and it is not yet accepted._

Every frame contains a durable decimal outbox `id`, a versioned `event` name, and JSON data. A connection first obtains a cursor from a REST snapshot, then resumes with `Last-Event-ID` or `?cursor=`; when both are supplied and disagree, the request is rejected.

The event families are planned as `raw_event.appended`, `trace.completed`, `semantic_chunk.pending`, `revision.committed`, `revision.stale`. `semantic_chunk.pending` contains only deterministic chunk/job metadata; unverified model nodes are never exposed through the stream. Clients deduplicate monotonically by ID, and after detecting a gap they stop applying and request re-delivery.

An old cursor past outbox retention returns `410 cursor_expired`, and the client clears its temporary state and fetches a new snapshot. Heartbeat comments do not consume an outbox ID. The SSE payload contains only refs/summaries and does not inline large artifacts.
