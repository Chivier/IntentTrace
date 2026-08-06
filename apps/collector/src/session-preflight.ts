import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { basename } from "node:path";

import { createAdapter } from "@intenttrace/adapters";
import {
  RawTraceEventInputSchema,
  SessionCatalogEntrySchema,
  type RawTraceEventInput,
  type SessionCatalogEntry,
  type TraceSourceKind,
} from "@intenttrace/schema";

import type { SessionFileCandidate } from "./session-discovery.js";

export interface PreparedSessionWarning {
  code: string;
  message: string;
}

export interface PreparedSession {
  candidate: SessionFileCandidate;
  contentSha256: string;
  events: RawTraceEventInput[];
  warnings: PreparedSessionWarning[];
  descriptor: SessionDescriptor;
}

export type SessionDescriptor = SessionCatalogEntry;

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
 * Parse and validate the complete source before the caller sends its first raw
 * fact. This prevents a malformed tail from leaving a partially imported trace.
 */
export async function prepareSession(
  source: TraceSourceKind,
  candidate: SessionFileCandidate,
  maxFileBytes: number,
): Promise<PreparedSession> {
  if (candidate.byteLength > maxFileBytes) {
    throw new Error("Session exceeds the configured file-size limit");
  }
  const handle = await open(candidate.filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let bytes: Uint8Array;
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      `${info.dev}:${info.ino}` !== candidate.fileIdentity ||
      info.size !== candidate.byteLength ||
      Math.trunc(info.mtimeMs) !== Math.trunc(candidate.modifiedAtMs)
    ) {
      throw new Error("Session changed after discovery; refresh the catalog");
    }
    bytes = await handle.readFile();
    const afterRead = await handle.stat();
    if (
      `${afterRead.dev}:${afterRead.ino}` !== candidate.fileIdentity ||
      afterRead.size !== candidate.byteLength ||
      Math.trunc(afterRead.mtimeMs) !== Math.trunc(candidate.modifiedAtMs)
    ) {
      throw new Error("Session changed after discovery; refresh the catalog");
    }
  } finally {
    await handle.close();
  }
  const adapter = createAdapter(source);
  // Keep the existing basename namespace stable; provider-native session IDs
  // remain the trace identity when the source format supplies one.
  const sourceIdentity = candidate.normalizationIdentity;
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
    candidate,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    events,
    warnings,
    descriptor: SessionCatalogEntrySchema.parse({
      id: candidate.id,
      source,
      title,
      projectHint: safeProjectHint(source, events),
      firstPromptPreview: prompts[0] ?? null,
      lastPromptPreview: prompts.at(-1) ?? null,
      lastActivityAt: latestActivity(events, candidate.modifiedAt),
      byteLength: candidate.byteLength,
      eventCount: events.length,
      warningCount: warnings.length,
      modifiedAt: candidate.modifiedAt,
    }),
  };
}
