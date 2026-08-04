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
  "session_meta",
  "turn_context",
  "event_msg",
  "response_item",
]);
const sensitivePayloadTypes = new Set(["reasoning", "agent_reasoning", "reasoning_raw_content"]);
const sensitiveKeys = new Set([
  "base_instructions",
  "encrypted_content",
  "instructions",
  "reasoning",
  "summary",
  "thinking",
]);
const sensitiveBlockTypes = new Set(["encrypted_content", "reasoning", "thinking"]);

interface SanitizedValue {
  value: unknown;
  omitted: number;
}

function sanitizeCodexValue(value: unknown): SanitizedValue {
  if (Array.isArray(value)) {
    const output: unknown[] = [];
    let omitted = 0;
    for (const item of value) {
      const itemObject = objectRecord(item);
      if (itemObject && sensitiveBlockTypes.has(String(itemObject.type ?? ""))) {
        omitted += 1;
        continue;
      }
      const sanitized = sanitizeCodexValue(item);
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
      const sanitized = sanitizeCodexValue(item);
      output[key] = sanitized.value;
      omitted += sanitized.omitted;
    }
    return { value: output, omitted };
  }
  return { value, omitted: 0 };
}

function codexKind(type: string, payload: Record<string, unknown> | null): RawEventKind {
  if (type === "session_meta") return "agent_start";
  if (type === "turn_context") return "log";
  if (type === "event_msg") {
    if (payload?.type === "user_message") return "user_message";
    if (payload?.type === "agent_message") return "assistant_message";
    return "log";
  }
  if (type === "response_item") {
    const itemType = String(payload?.type ?? "");
    if (/function_call_output|tool_call_output|tool_result/iu.test(itemType)) return "tool_result";
    if (/function_call|tool_call/iu.test(itemType)) return "tool_call";
    if (/message/iu.test(itemType))
      return payload?.role === "user" ? "user_message" : "assistant_message";
  }
  return "log";
}

export class CodexSessionAdapter implements TraceAdapter {
  readonly manifest: AdapterManifest = {
    source: "codex",
    adapterVersion: "1.0.0",
    supportedFormatVersions: ["codex-jsonl-v1"],
    status: "implemented",
  };

  async sniff(input: AdapterInput): Promise<boolean> {
    try {
      const first = objectRecord(parseJsonLines(decodeAdapterBytes(input.bytes))[0]?.value);
      return ["session_meta", "turn_context", "response_item", "event_msg"].includes(
        String(first?.type),
      );
    } catch {
      return false;
    }
  }

  async *parse(input: AdapterInput): AsyncIterable<AdapterRecord> {
    let records: ReturnType<typeof parseJsonLines>;
    try {
      records = parseJsonLines(decodeAdapterBytes(input.bytes));
    } catch (error) {
      throw new MalformedAdapterInputError("codex", String(error));
    }
    let sessionId = input.sourceIdentity;
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
      const version = declaredVersion?.startsWith("codex-jsonl-")
        ? declaredVersion
        : "codex-jsonl-v1";
      if (!this.manifest.supportedFormatVersions.includes(version)) {
        throw new UnsupportedAdapterVersionError("codex", version);
      }
      const payload = objectRecord(object.payload);
      if (object.type === "session_meta" && typeof payload?.id === "string") sessionId = payload.id;
      const eventId =
        typeof object.id === "string"
          ? object.id
          : typeof payload?.id === "string"
            ? payload.id
            : `${sessionId}-${record.line}`;
      const name = String(payload?.name ?? payload?.type ?? object.type);
      const payloadType = String(payload?.type ?? "");
      if (!supportedRecordTypes.has(object.type) || sensitivePayloadTypes.has(payloadType)) {
        yield {
          type: "warning",
          code: sensitivePayloadTypes.has(payloadType)
            ? "sensitive_reasoning_omitted"
            : "unsupported_record_omitted",
          message: `line ${record.line} ${object.type}/${payloadType || "none"} was omitted`,
          sourceEventId: eventId,
        };
        continue;
      }
      const sanitized = sanitizeCodexValue(object);
      const sanitizedObject = objectRecord(sanitized.value) ?? { type: object.type };
      const sanitizedPayload = objectRecord(sanitizedObject.payload);
      if (sanitized.omitted > 0) {
        yield {
          type: "warning",
          code: "sensitive_content_omitted",
          message: `line ${record.line} omitted ${sanitized.omitted} sensitive field(s)`,
          sourceEventId: eventId,
        };
      }
      yield {
        type: "event",
        event: normalizeEvent(
          {
            source: "codex",
            formatVersion: version,
            adapterVersion: this.manifest.adapterVersion,
            sourceIdentity: input.sourceIdentity,
            sessionId,
            line: record.line,
          },
          {
            sourceEventId: eventId,
            occurredAt: typeof object.timestamp === "string" ? object.timestamp : undefined,
            kind: codexKind(object.type, sanitizedPayload),
            name,
            status: object.type === "event_msg" && payload?.type === "error" ? "error" : "ok",
            agentId: typeof payload?.agent_id === "string" ? payload.agent_id : "codex",
            attributes: {
              recordType: object.type,
              ...(payloadType ? { payloadType } : {}),
              ...(declaredVersion && !declaredVersion.startsWith("codex-jsonl-")
                ? { clientVersion: declaredVersion }
                : {}),
            },
            payload: sanitizedObject,
            traceTitle: `Codex session ${sessionId}`,
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
