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

function codexKind(type: string, payload: Record<string, unknown> | null): RawEventKind {
  if (type === "session_meta") return "agent_start";
  if (type === "turn_context") return "user_message";
  if (type === "event_msg") return payload?.type === "task_complete" ? "trace_complete" : "log";
  if (type === "response_item") {
    const itemType = String(payload?.type ?? "");
    if (/function_call|tool_call/iu.test(itemType)) return "tool_call";
    if (/function_call_output|tool_result/iu.test(itemType)) return "tool_result";
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
      const version = typeof object.version === "string" ? object.version : "codex-jsonl-v1";
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
            kind: codexKind(object.type, payload),
            name,
            status: object.type === "event_msg" && payload?.type === "error" ? "error" : "ok",
            agentId: typeof payload?.agent_id === "string" ? payload.agent_id : "codex",
            attributes: { recordType: object.type },
            payload: object,
            traceTitle: `Codex session ${sessionId}`,
          },
        ),
      };
      yield {
        type: "artifact",
        sourceEventId: eventId,
        bytes: record.bytes,
        mediaType: "application/json",
      };
    }
  }
}
