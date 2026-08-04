import type { RawEventKind } from "@intenttrace/schema";

import {
  decodeAdapterBytes,
  displayName,
  displayPreview,
  normalizeEvent,
  objectRecord,
  parseJsonLines,
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
  "session_meta",
  "turn_context",
  "event_msg",
  "response_item",
]);
const sensitivePayloadTypes = new Set(["reasoning", "agent_reasoning", "reasoning_raw_content"]);
const sensitiveKeys = new Set(["base_instructions", "encrypted_content", "reasoning", "thinking"]);
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

function codexDisplay(
  recordType: string,
  payload: Record<string, unknown> | null,
  toolNames: ReadonlyMap<string, string>,
): { name: string; toolName?: string; contentType: string } {
  const payloadType = String(payload?.type ?? "");
  if (recordType === "session_meta") {
    return {
      name: displayName("Codex session started", payload?.model ?? payload?.model_provider),
      contentType: "session",
    };
  }
  if (recordType === "turn_context") {
    return { name: "Turn context", contentType: "context" };
  }
  if (recordType === "response_item") {
    if (payloadType === "message" || payloadType === "agent_message") {
      const role = String(payload?.role ?? (payloadType === "agent_message" ? "agent" : "message"));
      return {
        name: displayName(
          role === "user" ? "User" : role === "agent" ? "Agent" : "Assistant",
          payload?.content,
        ),
        contentType: role === "user" ? "user_message" : "assistant_message",
      };
    }
    if (/function_call_output|tool_call_output|tool_result/iu.test(payloadType)) {
      const callId = String(payload?.call_id ?? "");
      const toolName = toolNames.get(callId);
      return {
        name: displayName(toolName ? `Tool result: ${toolName}` : "Tool result", payload?.output),
        ...(toolName ? { toolName } : {}),
        contentType: "tool_result",
      };
    }
    if (/function_call|tool_call/iu.test(payloadType)) {
      const toolName = String(payload?.name ?? payload?.namespace ?? "tool");
      return {
        name: displayName(`Tool call: ${toolName}`, payload?.input ?? payload?.arguments),
        toolName,
        contentType: "tool_call",
      };
    }
  }
  if (recordType === "event_msg") {
    if (payloadType === "user_message")
      return { name: displayName("User", payload?.message), contentType: "user_message" };
    if (payloadType === "agent_message")
      return {
        name: displayName("Assistant", payload?.message),
        contentType: "assistant_message",
      };
    if (payloadType === "task_started") return { name: "Task started", contentType: "lifecycle" };
    if (payloadType === "task_complete")
      return {
        name: displayName("Task completed", payload?.last_agent_message),
        contentType: "lifecycle",
      };
    if (payloadType === "patch_apply_end")
      return {
        name: displayName(
          payload?.success === false ? "Patch failed" : "Patch applied",
          payload?.changes ?? payload?.stderr ?? payload?.stdout,
        ),
        contentType: "tool_result",
      };
    if (payloadType === "sub_agent_activity")
      return {
        name: displayName(`Sub-agent ${String(payload?.kind ?? "activity")}`, payload?.agent_path),
        contentType: "agent_activity",
      };
    if (payloadType === "mcp_tool_call_end")
      return {
        name: displayName("MCP tool result", payload?.result ?? payload?.invocation),
        contentType: "tool_result",
      };
    if (payloadType === "token_count") {
      const total = objectRecord(payload?.info)?.total_token_usage;
      return { name: displayName("Token usage", total), contentType: "telemetry" };
    }
    if (payloadType === "turn_aborted")
      return { name: displayName("Turn aborted", payload?.reason), contentType: "error" };
    if (payloadType === "error")
      return {
        name: displayName("Error", payload?.message ?? payload?.error),
        contentType: "error",
      };
    return { name: displayName(payloadType || "Codex event", payload), contentType: "metadata" };
  }
  return { name: displayName(payloadType || recordType, payload), contentType: "metadata" };
}

export class CodexSessionAdapter implements TraceAdapter {
  readonly manifest: AdapterManifest = {
    source: "codex",
    adapterVersion: "2.0.0",
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
    const toolNames = new Map<string, string>();
    const firstRequest = records.find((record) => {
      const candidate = objectRecord(record.value);
      const candidatePayload = objectRecord(candidate?.payload);
      return (
        (candidate?.type === "event_msg" && candidatePayload?.type === "user_message") ||
        (candidate?.type === "response_item" &&
          candidatePayload?.type === "message" &&
          candidatePayload?.role === "user")
      );
    });
    const firstRequestPayload = objectRecord(objectRecord(firstRequest?.value)?.payload);
    const tracePreview = displayPreview(
      firstRequestPayload?.message ?? firstRequestPayload?.content,
      120,
    );
    const traceTitle = tracePreview ? `Codex · ${tracePreview}` : "Codex session";
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
      let omitted = sanitized.omitted;
      if (object.type === "turn_context" && sanitizedPayload && "summary" in sanitizedPayload) {
        delete sanitizedPayload.summary;
        omitted += 1;
      }
      if (omitted > 0) {
        yield {
          type: "warning",
          code: "sensitive_content_omitted",
          message: `line ${record.line} omitted ${omitted} sensitive field(s)`,
          sourceEventId: eventId,
        };
      }
      const callId = String(sanitizedPayload?.call_id ?? "");
      if (
        object.type === "response_item" &&
        /function_call|tool_call/iu.test(payloadType) &&
        !/output|result/iu.test(payloadType)
      ) {
        toolNames.set(
          callId,
          String(sanitizedPayload?.name ?? sanitizedPayload?.namespace ?? "tool"),
        );
      }
      const display = codexDisplay(object.type, sanitizedPayload, toolNames);
      yield {
        type: "event",
        event: normalizeEvent(
          {
            source: "codex",
            formatVersion: version,
            adapterVersion: this.manifest.adapterVersion,
            sourceIdentity: input.sourceIdentity,
            sessionId: `${sessionId}@${this.manifest.adapterVersion}`,
            line: record.line,
          },
          {
            sourceEventId: eventId,
            occurredAt: typeof object.timestamp === "string" ? object.timestamp : undefined,
            kind: codexKind(object.type, sanitizedPayload),
            name: display.name,
            status: object.type === "event_msg" && payload?.type === "error" ? "error" : "ok",
            agentId: typeof payload?.agent_id === "string" ? payload.agent_id : "codex",
            attributes: {
              recordType: object.type,
              ...(payloadType ? { payloadType } : {}),
              contentType: display.contentType,
              ...(display.toolName ? { toolName: display.toolName } : {}),
              ...(declaredVersion && !declaredVersion.startsWith("codex-jsonl-")
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
