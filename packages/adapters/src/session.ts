import { createHash } from "node:crypto";
import { basename } from "node:path";

import {
  RawTraceEventInputSchema,
  SessionCatalogEntrySchema,
  type RawTraceEventInput,
  type SessionCatalogEntry,
  type TraceSourceKind,
} from "@intenttrace/schema";

import { createAdapter } from "./registry.js";

export interface PreparedSessionWarning {
  code: string;
  message: string;
}

export interface SessionDescriptorMeta {
  /** 24 lowercase hex, satisfies `SessionCatalogIdSchema`. */
  id: string;
  byteLength: number;
  /** `TimestampSchema`: ISO-8601 with an explicit offset. */
  modifiedAt: string;
}

export interface PreparedSessionBytes {
  source: TraceSourceKind;
  contentSha256: string;
  events: RawTraceEventInput[];
  warnings: PreparedSessionWarning[];
  descriptor: SessionCatalogEntry;
}

function promptPreview(event: RawTraceEventInput): string | null {
  if (event.kind !== "user_message") return null;
  const preview = event.name.replace(/^User\s*[·:]?\s*/iu, "").trim();
  return preview ? preview.slice(0, 160) : null;
}

function cwdFromPayload(source: TraceSourceKind, payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const object = payload as Record<string, unknown>;
  if (source === "claude") return typeof object.cwd === "string" ? object.cwd : null;
  if (source === "codex") {
    const nested = object.payload;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const cwd = (nested as Record<string, unknown>).cwd;
      return typeof cwd === "string" ? cwd : null;
    }
  }
  return null;
}

function safeProjectHint(
  source: TraceSourceKind,
  events: readonly RawTraceEventInput[],
): string | null {
  for (const event of events) {
    const cwd = cwdFromPayload(source, event.payload);
    if (!cwd) continue;
    const hint = basename(cwd.trim());
    if (hint && hint !== "." && hint !== "/") return hint.slice(0, 120);
  }
  return null;
}

function latestActivity(events: readonly RawTraceEventInput[], fallback: string): string {
  let latest = Number.NEGATIVE_INFINITY;
  let latestIso = fallback;
  for (const event of events) {
    const timestamp = Date.parse(event.occurredAt);
    if (Number.isFinite(timestamp) && timestamp > latest && timestamp > 0) {
      latest = timestamp;
      latestIso = event.occurredAt;
    }
  }
  return latestIso;
}

/**
 * Parse and validate the complete input before the caller sends its first raw
 * fact. This prevents a malformed tail from leaving a partially imported trace.
 */
export async function prepareSessionBytes(
  source: TraceSourceKind,
  bytes: Uint8Array,
  sourceIdentity: string,
  meta: SessionDescriptorMeta,
): Promise<PreparedSessionBytes> {
  const adapter = createAdapter(source);
  const events: RawTraceEventInput[] = [];
  const warnings: PreparedSessionWarning[] = [];

  for await (const record of adapter.parse({ bytes, sourceIdentity })) {
    if (record.type === "warning") {
      warnings.push({
        code: record.code,
        message: record.message,
      });
      continue;
    }
    if (record.type === "event") {
      events.push(RawTraceEventInputSchema.parse(record.event));
    }
  }
  if (events.length === 0) {
    throw new Error("Session contains no importable visible events");
  }

  const prompts = events.map(promptPreview).filter((value): value is string => value !== null);
  const title = events.find((event) => event.traceTitle)?.traceTitle ?? `${source} session`;
  return {
    source,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    events,
    warnings,
    descriptor: SessionCatalogEntrySchema.parse({
      id: meta.id,
      source,
      title,
      projectHint: safeProjectHint(source, events),
      firstPromptPreview: prompts[0] ?? null,
      lastPromptPreview: prompts.at(-1) ?? null,
      lastActivityAt: latestActivity(events, meta.modifiedAt),
      byteLength: meta.byteLength,
      eventCount: events.length,
      warningCount: warnings.length,
      modifiedAt: meta.modifiedAt,
    }),
  };
}

/**
 * Catalog id for a session handed over as bytes rather than discovered on disk.
 * Domain-separated from the collector's path-derived `sessionCatalogId`, and
 * the same 24-hex shape so `SessionCatalogIdSchema` is unchanged.
 */
export function uploadSessionKey(source: TraceSourceKind, contentSha256: string): string {
  return createHash("sha256")
    .update("intenttrace-session-upload-v1")
    .update("\0")
    .update(source)
    .update("\0")
    .update(contentSha256)
    .digest("hex")
    .slice(0, 24);
}

/** Strips prompt text and the derived title unless the caller opted into previews. */
export function redactCatalogEntry(
  entry: SessionCatalogEntry,
  includePreviews: boolean,
): SessionCatalogEntry {
  if (includePreviews) return entry;
  return {
    ...entry,
    title: `${entry.source === "claude" ? "Claude" : entry.source === "codex" ? "Codex" : entry.source.toUpperCase()} session`,
    firstPromptPreview: null,
    lastPromptPreview: null,
  };
}

/**
 * The `trace_complete` marker closing an offline import. Its identity is
 * derived from the file's content hash, not from the transport, so a CLI import
 * and a browser upload of the same bytes are mutually idempotent.
 */
export function buildCompletionMarker(
  lastEvent: RawTraceEventInput,
  contentSha256: string,
): RawTraceEventInput {
  const completion = { ...lastEvent };
  delete completion.agentId;
  delete completion.spanId;
  delete completion.parentSpanId;
  delete completion.subjectId;
  delete completion.causationEventId;
  delete completion.payload;
  delete completion.payloadRef;
  return RawTraceEventInputSchema.parse({
    ...completion,
    source: {
      ...completion.source,
      sourceEventId: `import-complete-${contentSha256.slice(0, 32)}`,
    },
    kind: "trace_complete",
    name: "Offline import complete",
    status: "ok",
    artifactRefs: [],
    attributes: {
      collectorMarker: "offline_import_complete",
      contentSha256,
    },
  });
}

export type SessionFailureCode =
  | "preflight_failed"
  | "unsupported_version"
  | "no_visible_events"
  | "stale_session"
  | "file_too_large"
  | "unknown_source_format";

export function classifySessionFailure(error: unknown): {
  code: SessionFailureCode;
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Session contains no importable visible events") {
    return { code: "no_visible_events", message };
  }
  if (message === "Session changed after discovery; refresh the catalog") {
    return { code: "stale_session", message };
  }
  if (message === "Session exceeds the configured file-size limit") {
    return { code: "file_too_large", message };
  }
  if (message === "Unable to determine the session format") {
    return { code: "unknown_source_format", message };
  }
  const unsupported = /Unsupported ([A-Za-z0-9_.:-]+) format version: ([A-Za-z0-9_.:-]+)/u.exec(
    message,
  );
  if (unsupported) {
    return {
      code: "unsupported_version",
      message: `Unsupported ${unsupported[1]} format version: ${unsupported[2]}`,
    };
  }
  // JSON parsers may quote source text in their native error. Never echo that
  // text from discovery/import diagnostics.
  return {
    code: "preflight_failed",
    message: "Session preflight failed; no events were imported",
  };
}
