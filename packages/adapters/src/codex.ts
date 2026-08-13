import { createHash } from "node:crypto";
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
  normalizeAdapterInput,
  singleAdapterPart,
  UnsupportedAdapterVersionError,
  type AdapterInput,
  type AdapterManifest,
  type AdapterRecord,
  type TraceAdapter,
} from "./types.js";
import { lookupTopologyCapability } from "./topology.js";

const supportedRecordTypes = new Set(["session_meta", "turn_context", "event_msg", "response_item"]);
const sensitivePayloadTypes = new Set(["reasoning", "agent_reasoning", "reasoning_raw_content"]);
const sensitiveKeys = new Set(["base_instructions", "encrypted_content", "reasoning", "thinking"]);
const sensitiveBlockTypes = new Set(["encrypted_content", "reasoning", "thinking"]);

interface SanitizedValue { value: unknown; omitted: number }

function sanitizeCodexValue(value: unknown): SanitizedValue {
  if (typeof value === "string" && /^gAAAAA/iu.test(value)) return { value: "[encrypted content omitted]", omitted: 1 };
  if (Array.isArray(value)) {
    const output: unknown[] = [];
    let omitted = 0;
    for (const item of value) {
      const itemObject = objectRecord(item);
      if (itemObject && sensitiveBlockTypes.has(String(itemObject.type ?? ""))) { omitted += 1; continue; }
      const sanitized = sanitizeCodexValue(item);
      output.push(sanitized.value);
      omitted += sanitized.omitted;
    }
    return { value: output, omitted };
  }
  const object = objectRecord(value);
  if (!object) return { value, omitted: 0 };
  const output: Record<string, unknown> = {};
  let omitted = 0;
  for (const [key, item] of Object.entries(object)) {
    if (sensitiveKeys.has(key)) { omitted += 1; continue; }
    const sanitized = sanitizeCodexValue(item);
    output[key] = sanitized.value;
    omitted += sanitized.omitted;
  }
  return { value: output, omitted };
}

function codexKind(type: string, payload: Record<string, unknown> | null): RawEventKind {
  if (type === "session_meta") return "agent_start";
  if (type === "turn_context") return "log";
  if (type === "event_msg") {
    if (payload?.type === "user_message") return "user_message";
    if (payload?.type === "agent_message") return "assistant_message";
    if (payload?.type === "sub_agent_activity") return "agent_start";
    return "log";
  }
  if (type === "response_item") {
    const itemType = String(payload?.type ?? "");
    if (/function_call_output|tool_call_output|tool_result/iu.test(itemType)) return "tool_result";
    if (/function_call|tool_call/iu.test(itemType)) return "tool_call";
    if (/message/iu.test(itemType)) return payload?.role === "user" ? "user_message" : "assistant_message";
  }
  return "log";
}

function codexDisplay(recordType: string, payload: Record<string, unknown> | null, toolNames: ReadonlyMap<string, string>): { name: string; toolName?: string; contentType: string } {
  const payloadType = String(payload?.type ?? "");
  if (recordType === "session_meta") return { name: displayName("Codex session started", payload?.model ?? payload?.model_provider), contentType: "session" };
  if (recordType === "turn_context") return { name: "Turn context", contentType: "context" };
  if (recordType === "response_item") {
    if (payloadType === "message" || payloadType === "agent_message") {
      const role = String(payload?.role ?? (payloadType === "agent_message" ? "agent" : "message"));
      return { name: displayName(role === "user" ? "User" : role === "agent" ? "Agent" : "Assistant", payload?.content), contentType: role === "user" ? "user_message" : "assistant_message" };
    }
    if (/function_call_output|tool_call_output|tool_result/iu.test(payloadType)) {
      const callId = String(payload?.call_id ?? "");
      const toolName = toolNames.get(callId);
      return { name: displayName(toolName ? `Tool result: ${toolName}` : "Tool result", payload?.output), ...(toolName ? { toolName } : {}), contentType: "tool_result" };
    }
    if (/function_call|tool_call/iu.test(payloadType)) {
      const toolName = String(payload?.name ?? payload?.namespace ?? "tool");
      return { name: displayName(`Tool call: ${toolName}`, payload?.input ?? payload?.arguments), toolName, contentType: "tool_call" };
    }
  }
  if (recordType === "event_msg") {
    if (payloadType === "user_message") return { name: displayName("User", payload?.message), contentType: "user_message" };
    if (payloadType === "agent_message") return { name: displayName("Agent", payload?.message), contentType: "assistant_message" };
    if (payloadType === "task_started") return { name: "Task started", contentType: "lifecycle" };
    if (payloadType === "task_complete") return { name: displayName("Task completed", payload?.last_agent_message), contentType: "lifecycle" };
    if (payloadType === "sub_agent_activity") return { name: displayName(`Sub-agent ${String(payload?.kind ?? "activity")}`, payload?.agent_path), contentType: "agent_activity" };
    if (payloadType === "error") return { name: displayName("Error", payload?.message ?? payload?.error), contentType: "error" };
  }
  return { name: displayName(payloadType || recordType, payload), contentType: "metadata" };
}

interface CodexPart {
  path: string;
  records: SessionRecord[];
  lane: string;
  root: string;
  parent: string | null;
  historyMode: string;
  multiAgentVersion: string;
}

function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stringValue(value: unknown): string | null { return typeof value === "string" && value.length > 0 ? value : null; }

export class CodexSessionAdapter implements TraceAdapter {
  readonly manifest: AdapterManifest = {
    source: "codex",
    adapterVersion: "3.0.0",
    supportedFormatVersions: ["codex-jsonl-v1"],
    status: "implemented",
    topology: lookupTopologyCapability("codex", "3.0.0"),
  };

  async sniff(input: AdapterInput): Promise<boolean> {
    const part = singleAdapterPart(input);
    try {
      const first = objectRecord(readSessionRecords(decodeAdapterBytes(part.bytes))[0]?.value);
      return ["session_meta", "turn_context", "response_item", "event_msg"].includes(String(first?.type));
    } catch { return false; }
  }

  async *parse(input: AdapterInput): AsyncIterable<AdapterRecord> {
    const normalized = normalizeAdapterInput(input);
    const parts: CodexPart[] = [];
    const byId = new Map<string, CodexPart>();
    try {
      for (const part of normalized.parts) {
        const records = readSessionRecords(decodeAdapterBytes(part.bytes));
        const firstMeta = records.map((record) => objectRecord(record.value)).find((object) => object?.type === "session_meta");
        const meta = objectRecord(firstMeta?.payload);
        const lane = stringValue(meta?.id) ?? `${input.sourceIdentity}-${part.path}`;
        const sessionRoot = stringValue(meta?.session_id);
        const parent = stringValue(meta?.parent_thread_id);
        const ownFork = stringValue(meta?.forked_from_id);
        const candidate: CodexPart = { path: part.path, records, lane, root: sessionRoot ?? ownFork ?? lane, parent, historyMode: String(meta?.history_mode ?? "legacy"), multiAgentVersion: String(meta?.multi_agent_version ?? "v1") };
        parts.push(candidate); byId.set(lane, candidate);
      }
      for (const part of parts) {
        const visited = new Set<string>();
        let root = part.root;
        while (!visited.has(root)) {
          visited.add(root);
          const ancestor = byId.get(root);
          if (!ancestor || ancestor.root === root) break;
          root = ancestor.root;
        }
        part.root = root;
      }
    } catch (error) {
      throw new MalformedAdapterInputError("codex", String(error));
    }
    if (parts.length === 0) throw new MalformedAdapterInputError("codex", "bundle is empty");
    const root = parts.find((part) => part.lane === part.root)?.lane ?? parts[0]!.root;
    const traceParts = parts.filter((part) => part.root === root);
    const traceTitle = "Codex session";
    const seenPayloads = new Set<string>();
    const seenMessages = new Set<string>();
    const toolNames = new Map<string, string>();
    const spawnByCall = new Map<string, { parentLane: string; childLane: string; inferred: boolean }>();
    for (const part of traceParts) {
      for (const record of part.records) {
        const object = objectRecord(record.value);
        const payload = objectRecord(object?.payload);
        if (!object || !payload || typeof object.type !== "string") continue;
        const hash = hashPayload(payload);
        const forked = part.lane !== part.root && part.root !== part.lane;
        if (forked && seenPayloads.has(hash)) continue;
        seenPayloads.add(hash);
        const payloadType = String(payload.type ?? "");
        const eventId = stringValue(object.id) ?? stringValue(payload.id) ?? `${part.lane}-${record.line}`;
        if (object.type === "response_item" && payloadType === "agent_message") {
          const author = stringValue(payload.author); const recipient = stringValue(payload.recipient);
          const content = Array.isArray(payload.content) ? payload.content.map((item) => objectRecord(item)?.text ?? objectRecord(item)?.encrypted_content ?? "").join("\n") : "";
          const encrypted = content.match(/gAAAA[A-Za-z0-9_-]*/u)?.[0] ?? "";
          const messageKey = `${author ?? ""}\0${recipient ?? ""}\0${hashPayload(encrypted)}`;
          if (seenMessages.has(messageKey)) continue;
          seenMessages.add(messageKey);
        }
        if (object.type === "response_item" && /function_call|tool_call/iu.test(payloadType) && !/output|result/iu.test(payloadType)) {
          const callId = stringValue(payload.call_id);
          if (callId) toolNames.set(callId, String(payload.name ?? payload.namespace ?? "tool"));
          const name = String(payload.name ?? "");
          if (name === "spawn_agent" || name === "task") {
            const args = typeof payload.arguments === "string" ? (() => { try { return objectRecord(JSON.parse(payload.arguments)); } catch { return null; } })() : objectRecord(payload.arguments);
            const child = stringValue(objectRecord(args)?.agent_thread_id) ?? stringValue(objectRecord(args)?.agent_id);
            if (callId && child) spawnByCall.set(callId, { parentLane: part.lane, childLane: child, inferred: part.historyMode === "paginated" });
          }
        }
        if (object.type === "response_item" && payloadType === "function_call_output") {
          const output = typeof payload.output === "string" ? payload.output : "";
          try {
            const parsed = objectRecord(JSON.parse(output));
            const child = stringValue(parsed?.agent_id);
            const callId = stringValue(payload.call_id);
            if (callId && child) spawnByCall.set(callId, { parentLane: part.lane, childLane: child, inferred: part.historyMode === "paginated" });
          } catch { /* bare tool failures are normal */ }
        }
      }
    }
    for (const part of traceParts) {
      for (const record of part.records) {
        const object = objectRecord(record.value);
        if (!object || typeof object.type !== "string") {
          yield { type: "warning", code: "unknown_record", message: `line ${record.line} has no type` };
          continue;
        }
        const declaredVersion = typeof object.version === "string" ? object.version : undefined;
        const version = declaredVersion?.startsWith("codex-jsonl-") ? declaredVersion : "codex-jsonl-v1";
        if (!this.manifest.supportedFormatVersions.includes(version)) throw new UnsupportedAdapterVersionError("codex", version);
        const payload = objectRecord(object.payload);
        const payloadType = String(payload?.type ?? "");
        const eventId = stringValue(object.id) ?? stringValue(payload?.id) ?? `${part.lane}-${record.line}`;
        if (!payload || !supportedRecordTypes.has(object.type) || sensitivePayloadTypes.has(payloadType)) {
          yield { type: "warning", code: sensitivePayloadTypes.has(payloadType) ? "sensitive_reasoning_omitted" : "unsupported_record_omitted", message: `line ${record.line} ${object.type}/${payloadType || "none"} was omitted`, sourceEventId: eventId };
          continue;
        }
        const hash = hashPayload(payload);
        if (part.lane !== part.root && seenPayloads.has(`emitted:${hash}`)) continue;
        seenPayloads.add(`emitted:${hash}`);
        const sanitized = sanitizeCodexValue(object);
        const sanitizedObject = objectRecord(sanitized.value) ?? { type: object.type };
        const sanitizedPayload = objectRecord(sanitizedObject.payload);
        if (sanitized.omitted > 0) yield { type: "warning", code: "sensitive_content_omitted", message: `line ${record.line} omitted ${sanitized.omitted} sensitive field(s)`, sourceEventId: eventId };
        const activity = payloadType === "sub_agent_activity";
        const activityCall = activity ? stringValue(payload.event_id) : null;
        const childLane = activity ? stringValue(payload.agent_thread_id) : null;
        const spawn = activityCall && childLane ? { parentLane: part.lane, childLane, inferred: part.historyMode === "paginated" } : activityCall ? spawnByCall.get(activityCall) : undefined;
        const author = payloadType === "agent_message" ? stringValue(payload.author) : null;
        const recipient = payloadType === "agent_message" ? stringValue(payload.recipient) : null;
        const eventLane = author ?? (activity && childLane ? childLane : part.lane);
        const attributes: Record<string, unknown> = { recordType: object.type, ...(payloadType ? { payloadType } : {}), contentType: codexDisplay(object.type, sanitizedPayload, toolNames).contentType };
        if (spawn && activity && spawn.childLane === eventLane) {
          attributes.parentAgentId = spawn.parentLane;
          attributes.topologyProvenance = spawn.inferred ? "inferred" : "stated";
        }
        if (author && recipient) {
          attributes.senderAgentId = author; attributes.recipientAgentId = recipient; attributes.messageId = eventId;
          const content = Array.isArray(payload.content) ? payload.content.map((item) => objectRecord(item)?.text ?? "").join("\n") : "";
          if (/FINAL_ANSWER/iu.test(content)) { attributes.joinedBy = author; attributes.joinedAgentIds = [author]; }
        }
        const display = codexDisplay(object.type, sanitizedPayload, toolNames);
        yield { type: "event", event: normalizeEvent({ source: "codex", formatVersion: version, adapterVersion: this.manifest.adapterVersion, sourceIdentity: input.sourceIdentity, sessionId: `${root}@${this.manifest.adapterVersion}`, line: record.line }, { sourceEventId: eventId, occurredAt: typeof object.timestamp === "string" ? object.timestamp : undefined, kind: codexKind(object.type, sanitizedPayload), name: display.name, status: object.type === "event_msg" && payload.type === "error" ? "error" : "ok", agentId: eventLane, spanId: stringValue(payload.call_id) ?? (activityCall ?? undefined), parentSpanId: attributes.parentAgentId ? stringValue(payload.parent_span_id) ?? activityCall ?? undefined : undefined, attributes, payload: sanitizedObject, traceTitle }) };
        yield { type: "artifact", key: `event-${eventId}`, sourceEventId: eventId, bytes: new TextEncoder().encode(JSON.stringify(sanitizedObject)), mediaType: "application/json" };
      }
    }
  }
}
