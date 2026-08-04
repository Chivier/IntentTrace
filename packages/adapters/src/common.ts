import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import {
  RawTraceEventInputSchema,
  SchemaVersion,
  type RawEventKind,
  type RawTraceEventInput,
  type TraceSourceKind,
} from "@intenttrace/schema";

export function stableUuid(namespace: string, value: string): string {
  const bytes = createHash("sha256")
    .update(namespace)
    .update("\0")
    .update(value)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function decodeAdapterBytes(bytes: Uint8Array): string {
  const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
  return new TextDecoder("utf-8", { fatal: true }).decode(decoded);
}

export function parseJsonLines(
  text: string,
): Array<{ line: number; value: unknown; bytes: Uint8Array }> {
  const records: Array<{ line: number; value: unknown; bytes: Uint8Array }> = [];
  for (const [index, raw] of text.split(/\r?\n/u).entries()) {
    if (!raw.trim()) continue;
    records.push({
      line: index + 1,
      value: JSON.parse(raw) as unknown,
      bytes: new TextEncoder().encode(raw),
    });
  }
  return records;
}

export interface NormalizedContext {
  source: TraceSourceKind;
  formatVersion: string;
  adapterVersion: string;
  sourceIdentity: string;
  sessionId: string;
  line: number;
}

export function normalizeEvent(
  context: NormalizedContext,
  input: {
    sourceEventId?: string | undefined;
    occurredAt?: string | undefined;
    kind: RawEventKind;
    name: string;
    status?: "unset" | "ok" | "error";
    agentId?: string | undefined;
    spanId?: string | undefined;
    parentSpanId?: string | undefined;
    subjectId?: string | undefined;
    attributes?: Record<string, unknown> | undefined;
    payload?: unknown | undefined;
    traceTitle?: string | undefined;
  },
): RawTraceEventInput {
  const sourceInstanceId = safeIdentifier(
    context.sourceIdentity,
    `source-${stableUuid("source", context.sourceIdentity)}`,
  );
  const sourceEventId = safeIdentifier(
    input.sourceEventId ?? `${context.sessionId}-${context.line}`,
    `event-${context.line}`,
  );
  const traceId = stableUuid("intenttrace-trace", `${context.source}:${context.sessionId}`);
  return RawTraceEventInputSchema.parse({
    schemaVersion: SchemaVersion,
    workspaceId: stableUuid("intenttrace-workspace", "local"),
    projectId: stableUuid("intenttrace-project", context.sourceIdentity),
    traceId,
    workspaceName: "Local workspace",
    projectName: context.sourceIdentity,
    traceTitle: input.traceTitle ?? `${context.source} session ${context.sessionId}`,
    source: {
      kind: context.source,
      formatVersion: context.formatVersion,
      adapterVersion: context.adapterVersion,
      sourceInstanceId,
      sourceEventId,
    },
    occurredAt: normalizeTimestamp(input.occurredAt),
    kind: input.kind,
    name: input.name.slice(0, 240),
    status: input.status ?? "unset",
    ...(input.agentId ? { agentId: safeIdentifier(input.agentId, "agent") } : {}),
    ...(input.spanId ? { spanId: safeIdentifier(input.spanId, "span") } : {}),
    ...(input.parentSpanId
      ? { parentSpanId: safeIdentifier(input.parentSpanId, "parent-span") }
      : {}),
    ...(input.subjectId ? { subjectId: safeIdentifier(input.subjectId, "subject") } : {}),
    artifactRefs: [],
    attributes: input.attributes ?? {},
    ...(input.payload === undefined ? {} : { payload: input.payload }),
  });
}

export function normalizeTimestamp(value?: string): string {
  if (!value) return new Date(0).toISOString();
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.valueOf()) ? new Date(0).toISOString() : timestamp.toISOString();
}

export function safeIdentifier(value: string, fallback: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_.:-]/gu, "-").slice(0, 128);
  return normalized && /^[A-Za-z0-9_.:-]+$/u.test(normalized) ? normalized : fallback;
}

export function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function visibleText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const object = objectRecord(item);
        if (object) {
          if (typeof object.text === "string") return object.text;
          if (object.content !== undefined) return visibleText(object.content);
          if (object.output !== undefined) return visibleText(object.output);
        }
        return visibleText(item);
      })
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

export function displayPreview(value: unknown, limit = 200): string {
  const normalized = visibleText(value).replaceAll(/\s+/gu, " ").trim();
  return normalized.slice(0, limit);
}

export function displayName(label: string, value?: unknown): string {
  const preview = value === undefined ? "" : displayPreview(value);
  return preview ? `${label} · ${preview}` : label;
}
