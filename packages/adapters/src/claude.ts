import type { RawEventKind } from "@intenttrace/schema";

import { decodeAdapterBytes, normalizeEvent, objectRecord, parseJsonLines } from "./common.js";
import {
  MalformedAdapterInputError,
  UnsupportedAdapterVersionError,
  type AdapterInput,
  type AdapterManifest,
  type AdapterRecord,
  type TraceAdapter,
} from "./types.js";

const supportedRecordTypes = new Set([
  "user",
  "assistant",
  "system",
  "mode",
  "permission-mode",
  "progress",
  "tool_use",
  "tool_result",
]);
const recognizedRecordTypes = new Set([
  ...supportedRecordTypes,
  "ai-title",
  "attachment",
  "file-history-delta",
  "file-history-snapshot",
  "last-prompt",
  "queue-operation",
  "summary",
]);
const sensitiveKeys = new Set(["reasoning", "signature", "thinking"]);
const sensitiveBlockTypes = new Set(["redacted_thinking", "thinking"]);

interface SanitizedValue {
  value: unknown;
  omitted: number;
}

function sanitizeClaudeValue(value: unknown): SanitizedValue {
  if (Array.isArray(value)) {
    const output: unknown[] = [];
    let omitted = 0;
    for (const item of value) {
      const itemObject = objectRecord(item);
      if (itemObject && sensitiveBlockTypes.has(String(itemObject.type ?? ""))) {
        omitted += 1;
        continue;
      }
      const sanitized = sanitizeClaudeValue(item);
      output.push(sanitized.value);
      omitted += sanitized.omitted;
    }
    return { value: output, omitted };
  }
  const object = objectRecord(value);
  if (object) {
    const output: Record<string, unknown> = {};
    let omitted = 0;
    for (const [key, item] of Object.entries(object)) {
      if (sensitiveKeys.has(key)) {
        omitted += 1;
        continue;
      }
      const sanitized = sanitizeClaudeValue(item);
      output[key] = sanitized.value;
      omitted += sanitized.omitted;
    }
    return { value: output, omitted };
  }
  return { value, omitted: 0 };
}

function claudeContentTypes(object: Record<string, unknown>): Set<string> {
  const message = objectRecord(object.message);
  const content = Array.isArray(message?.content) ? message.content : [];
  return new Set(
    content
      .map((block) => objectRecord(block))
      .filter((block): block is Record<string, unknown> => block !== null)
      .map((block) => String(block.type ?? "")),
  );
}

function claudeKind(type: string, object: Record<string, unknown>): RawEventKind {
  const contentTypes = claudeContentTypes(object);
  if (type === "user") return contentTypes.has("tool_result") ? "tool_result" : "user_message";
  if (type === "assistant") return contentTypes.has("tool_use") ? "tool_call" : "assistant_message";
  if (type === "tool_use") return "tool_call";
  if (type === "tool_result") return "tool_result";
  if (object.is_error === true) return "error";
  return "log";
}

export class ClaudeSessionAdapter implements TraceAdapter {
  readonly manifest: AdapterManifest = {
    source: "claude",
    adapterVersion: "1.0.0",
    supportedFormatVersions: ["claude-jsonl-v1"],
    status: "implemented",
  };

  async sniff(input: AdapterInput): Promise<boolean> {
    try {
      const first = objectRecord(parseJsonLines(decodeAdapterBytes(input.bytes))[0]?.value);
      return recognizedRecordTypes.has(String(first?.type));
    } catch {
      return false;
    }
  }

  async *parse(input: AdapterInput): AsyncIterable<AdapterRecord> {
    let records: ReturnType<typeof parseJsonLines>;
    try {
      records = parseJsonLines(decodeAdapterBytes(input.bytes));
    } catch (error) {
      throw new MalformedAdapterInputError("claude", String(error));
    }
    for (const record of records) {
      const object = objectRecord(record.value);
      if (!object || typeof object.type !== "string") {
        yield {
          type: "warning",
          code: "unknown_record",
          message: `line ${record.line} has no type`,
        };
        continue;
      }
      const declaredVersion = typeof object.version === "string" ? object.version : undefined;
      const version = declaredVersion?.startsWith("claude-jsonl-")
        ? declaredVersion
        : "claude-jsonl-v1";
      if (!this.manifest.supportedFormatVersions.includes(version)) {
        throw new UnsupportedAdapterVersionError("claude", version);
      }
      const sessionId = String(object.sessionId ?? object.session_id ?? input.sourceIdentity);
      const eventId = String(object.uuid ?? object.id ?? `${sessionId}-${record.line}`);
      if (!supportedRecordTypes.has(object.type)) {
        yield {
          type: "warning",
          code: "unsupported_record_omitted",
          message: `line ${record.line} ${object.type} was omitted`,
          sourceEventId: eventId,
        };
        continue;
      }
      const sanitized = sanitizeClaudeValue(object);
      const sanitizedObject = objectRecord(sanitized.value) ?? { type: object.type };
      if (sanitized.omitted > 0) {
        yield {
          type: "warning",
          code: "sensitive_reasoning_omitted",
          message: `line ${record.line} omitted ${sanitized.omitted} sensitive block(s)`,
          sourceEventId: eventId,
        };
      }
      const message = objectRecord(sanitizedObject.message);
      const name = String(message?.role ?? object.type);
      yield {
        type: "event",
        event: normalizeEvent(
          {
            source: "claude",
            formatVersion: version,
            adapterVersion: this.manifest.adapterVersion,
            sourceIdentity: input.sourceIdentity,
            sessionId,
            line: record.line,
          },
          {
            sourceEventId: eventId,
            occurredAt: typeof object.timestamp === "string" ? object.timestamp : undefined,
            kind: claudeKind(object.type, sanitizedObject),
            name,
            status:
              object.is_error === true || object.isApiErrorMessage === true || object.error
                ? "error"
                : "ok",
            agentId: typeof object.agentId === "string" ? object.agentId : "claude",
            attributes: {
              recordType: object.type,
              ...(declaredVersion && !declaredVersion.startsWith("claude-jsonl-")
                ? { clientVersion: declaredVersion }
                : {}),
            },
            payload: sanitizedObject,
            traceTitle: `Claude session ${sessionId}`,
          },
        ),
      };
      yield {
        type: "artifact",
        sourceEventId: eventId,
        bytes: new TextEncoder().encode(JSON.stringify(sanitizedObject)),
        mediaType: "application/json",
      };
    }
  }
}
