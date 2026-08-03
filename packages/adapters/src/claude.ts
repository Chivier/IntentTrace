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

function claudeKind(type: string, object: Record<string, unknown>): RawEventKind {
  if (type === "user") return "user_message";
  if (type === "assistant") return "assistant_message";
  if (type === "tool_use") return "tool_call";
  if (type === "tool_result") return "tool_result";
  if (type === "summary") return "trace_complete";
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
      return [
        "user",
        "assistant",
        "progress",
        "system",
        "summary",
        "tool_use",
        "tool_result",
      ].includes(String(first?.type));
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
      const version = typeof object.version === "string" ? object.version : "claude-jsonl-v1";
      if (!this.manifest.supportedFormatVersions.includes(version)) {
        throw new UnsupportedAdapterVersionError("claude", version);
      }
      const sessionId = String(object.sessionId ?? object.session_id ?? input.sourceIdentity);
      const eventId = String(object.uuid ?? object.id ?? `${sessionId}-${record.line}`);
      const message = objectRecord(object.message);
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
            kind: claudeKind(object.type, object),
            name,
            status: object.is_error === true ? "error" : "ok",
            agentId: typeof object.agentId === "string" ? object.agentId : "claude",
            attributes: { recordType: object.type },
            payload: object,
            traceTitle: `Claude session ${sessionId}`,
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
