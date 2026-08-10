import type { RawEventKind } from "@intenttrace/schema";

import {
  decodeAdapterBytes,
  displayName,
  displayPreview,
  normalizeEvent,
  objectRecord,
  readSessionRecords,
  type SessionRecord,
} from "./common.js";
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
const sensitiveKeys = new Set(["reasoning", "thinking"]);
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
  if (object.is_error === true || object.isApiErrorMessage === true || object.error) return "error";
  const contentTypes = claudeContentTypes(object);
  if (type === "user") return contentTypes.has("tool_result") ? "tool_result" : "user_message";
  if (type === "assistant") return contentTypes.has("tool_use") ? "tool_call" : "assistant_message";
  if (type === "tool_use") return "tool_call";
  if (type === "tool_result") return "tool_result";
  if (object.is_error === true) return "error";
  return "log";
}

function claudeDisplay(
  type: string,
  object: Record<string, unknown>,
): {
  name: string;
  toolName?: string;
  contentType: string;
} {
  const message = objectRecord(object.message);
  const content = Array.isArray(message?.content) ? message.content : message?.content;
  const firstBlock = Array.isArray(content) ? objectRecord(content[0]) : null;
  if (type === "user") {
    if (firstBlock?.type === "tool_result") {
      return {
        name: displayName("Tool result", firstBlock.content),
        contentType: "tool_result",
      };
    }
    return { name: displayName("User", content), contentType: "user_message" };
  }
  if (type === "assistant") {
    if (object.is_error === true || object.isApiErrorMessage === true || object.error) {
      return {
        name: displayName("Claude error", object.error ?? content),
        contentType: "error",
      };
    }
    if (firstBlock?.type === "tool_use") {
      const toolName = String(firstBlock.name ?? "tool");
      return {
        name: displayName(`Tool call: ${toolName}`, firstBlock.input),
        toolName,
        contentType: "tool_call",
      };
    }
    return { name: displayName("Assistant", content), contentType: "assistant_message" };
  }
  if (type === "system")
    return { name: displayName("System", object.content), contentType: "system" };
  if (type === "mode") return { name: displayName("Mode", object.mode), contentType: "metadata" };
  if (type === "permission-mode")
    return {
      name: displayName("Permission mode", object.permissionMode),
      contentType: "metadata",
    };
  if (type === "progress")
    return {
      name: displayName("Progress", object.content ?? object.data),
      contentType: "progress",
    };
  if (type === "tool_use") {
    const toolName = String(object.name ?? "tool");
    return {
      name: displayName(`Tool call: ${toolName}`, object.input),
      toolName,
      contentType: "tool_call",
    };
  }
  if (type === "tool_result")
    return { name: displayName("Tool result", object.content), contentType: "tool_result" };
  return { name: displayName(`Claude ${type}`, object), contentType: "metadata" };
}

export class ClaudeSessionAdapter implements TraceAdapter {
  readonly manifest: AdapterManifest = {
    source: "claude",
    adapterVersion: "2.0.0",
    supportedFormatVersions: ["claude-jsonl-v1"],
    status: "implemented",
  };

  async sniff(input: AdapterInput): Promise<boolean> {
    try {
      const first = objectRecord(readSessionRecords(decodeAdapterBytes(input.bytes))[0]?.value);
      return recognizedRecordTypes.has(String(first?.type));
    } catch {
      return false;
    }
  }

  async *parse(input: AdapterInput): AsyncIterable<AdapterRecord> {
    let records: SessionRecord[];
    try {
      records = readSessionRecords(decodeAdapterBytes(input.bytes));
    } catch (error) {
      throw new MalformedAdapterInputError("claude", String(error));
    }
    const firstRequest = records.find((record) => {
      const candidate = objectRecord(record.value);
      return candidate?.type === "user" && objectRecord(candidate.message)?.role === "user";
    });
    const firstRequestContent = objectRecord(objectRecord(firstRequest?.value)?.message)?.content;
    const tracePreview = displayPreview(firstRequestContent, 120);
    const traceTitle = tracePreview ? `Claude · ${tracePreview}` : "Claude session";
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
      const sanitizedMessage = objectRecord(sanitizedObject.message);
      if (
        object.type === "assistant" &&
        Array.isArray(sanitizedMessage?.content) &&
        sanitizedMessage.content.length === 0 &&
        sanitized.omitted > 0
      ) {
        continue;
      }
      const display = claudeDisplay(object.type, sanitizedObject);
      yield {
        type: "event",
        event: normalizeEvent(
          {
            source: "claude",
            formatVersion: version,
            adapterVersion: this.manifest.adapterVersion,
            sourceIdentity: input.sourceIdentity,
            sessionId: `${sessionId}@${this.manifest.adapterVersion}`,
            line: record.line,
          },
          {
            sourceEventId: eventId,
            occurredAt: typeof object.timestamp === "string" ? object.timestamp : undefined,
            kind: claudeKind(object.type, sanitizedObject),
            name: display.name,
            status:
              object.is_error === true || object.isApiErrorMessage === true || object.error
                ? "error"
                : "ok",
            agentId: typeof object.agentId === "string" ? object.agentId : "claude",
            attributes: {
              recordType: object.type,
              contentType: display.contentType,
              ...(display.toolName ? { toolName: display.toolName } : {}),
              ...(declaredVersion && !declaredVersion.startsWith("claude-jsonl-")
                ? { clientVersion: declaredVersion }
                : {}),
            },
            payload: sanitizedObject,
            traceTitle,
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
