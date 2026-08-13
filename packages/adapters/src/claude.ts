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

const supportedRecordTypes = new Set(["user", "assistant", "system", "mode", "permission-mode", "progress", "tool_use", "tool_result"]);
const recognizedRecordTypes = new Set([...supportedRecordTypes, "ai-title", "attachment", "file-history-delta", "file-history-snapshot", "last-prompt", "queue-operation", "summary"]);
const sensitiveKeys = new Set(["reasoning", "thinking", "thinkingSignature", "signature"]);
const sensitiveBlockTypes = new Set(["redacted_thinking", "thinking"]);

interface SanitizedValue { value: unknown; omitted: number }
function sanitizeClaudeValue(value: unknown): SanitizedValue {
  if (Array.isArray(value)) {
    const output: unknown[] = []; let omitted = 0;
    for (const item of value) {
      const itemObject = objectRecord(item);
      if (itemObject && sensitiveBlockTypes.has(String(itemObject.type ?? ""))) { omitted += 1; continue; }
      const sanitized = sanitizeClaudeValue(item); output.push(sanitized.value); omitted += sanitized.omitted;
    }
    return { value: output, omitted };
  }
  const object = objectRecord(value);
  if (!object) return { value, omitted: 0 };
  const output: Record<string, unknown> = {}; let omitted = 0;
  for (const [key, item] of Object.entries(object)) {
    if (sensitiveKeys.has(key)) { omitted += 1; continue; }
    const sanitized = sanitizeClaudeValue(item); output[key] = sanitized.value; omitted += sanitized.omitted;
  }
  return { value: output, omitted };
}
function claudeContentTypes(object: Record<string, unknown>): Set<string> {
  const message = objectRecord(object.message); const content = Array.isArray(message?.content) ? message.content : [];
  return new Set(content.map((block) => objectRecord(block)).filter((block): block is Record<string, unknown> => block !== null).map((block) => String(block.type ?? "")));
}
function claudeKind(type: string, object: Record<string, unknown>): RawEventKind {
  if (object.is_error === true || object.isApiErrorMessage === true || object.error) return "error";
  const contentTypes = claudeContentTypes(object);
  if (type === "user") return contentTypes.has("tool_result") ? "tool_result" : "user_message";
  if (type === "assistant") return contentTypes.has("tool_use") ? "tool_call" : "assistant_message";
  if (type === "tool_use") return "tool_call";
  if (type === "tool_result") return "tool_result";
  return "log";
}
function claudeDisplay(type: string, object: Record<string, unknown>): { name: string; toolName?: string; contentType: string } {
  const message = objectRecord(object.message); const content = Array.isArray(message?.content) ? message.content : message?.content; const firstBlock = Array.isArray(content) ? objectRecord(content[0]) : null;
  if (type === "user") return firstBlock?.type === "tool_result" ? { name: displayName("Tool result", firstBlock.content), contentType: "tool_result" } : { name: displayName("User", content), contentType: "user_message" };
  if (type === "assistant") {
    if (firstBlock?.type === "tool_use") { const toolName = String(firstBlock.name ?? "tool"); return { name: displayName(`Tool call: ${toolName}`, firstBlock.input), toolName, contentType: "tool_call" }; }
    return { name: displayName("Assistant", content), contentType: "assistant_message" };
  }
  if (type === "system") return { name: displayName("System", object.content), contentType: "system" };
  if (type === "progress") return { name: displayName("Progress", object.content ?? object.data), contentType: "progress" };
  if (type === "tool_use") { const toolName = String(object.name ?? "tool"); return { name: displayName(`Tool call: ${toolName}`, object.input), toolName, contentType: "tool_call" }; }
  if (type === "tool_result") return { name: displayName("Tool result", object.content), contentType: "tool_result" };
  return { name: displayName(`Claude ${type}`, object), contentType: "metadata" };
}
function stringValue(value: unknown): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
interface ClaudePart { path: string; records: SessionRecord[]; lane: string; sidecar: Record<string, unknown> | null }

export class ClaudeSessionAdapter implements TraceAdapter {
  readonly manifest: AdapterManifest = { source: "claude", adapterVersion: "3.0.0", supportedFormatVersions: ["claude-jsonl-v1"], status: "implemented", topology: lookupTopologyCapability("claude", "3.0.0") };
  async sniff(input: AdapterInput): Promise<boolean> {
    const part = singleAdapterPart(input);
    try { return recognizedRecordTypes.has(String(objectRecord(readSessionRecords(decodeAdapterBytes(part.bytes))[0]?.value)?.type)); } catch { return false; }
  }
  async *parse(input: AdapterInput): AsyncIterable<AdapterRecord> {
    const normalized = normalizeAdapterInput(input); const parts: ClaudePart[] = []; let rootSession = input.sourceIdentity;
    try {
      for (const part of normalized.parts) {
        if (part.path.endsWith(".meta.json")) continue;
        const records = readSessionRecords(decodeAdapterBytes(part.bytes));
        const first = objectRecord(records[0]?.value); const sessionId = stringValue(first?.sessionId) ?? input.sourceIdentity;
        if (!part.path.includes("/subagents/") && !part.path.startsWith("subagents/")) rootSession = sessionId;
        const childAgent = stringValue(first?.agentId);
        const lane = childAgent ?? rootSession;
        parts.push({ path: part.path, records, lane, sidecar: null });
      }
      for (const part of normalized.parts.filter((candidate) => candidate.path.endsWith(".meta.json"))) {
        const object = objectRecord(JSON.parse(decodeAdapterBytes(part.bytes)));
        const agentId = part.path.match(/agent-([^/.]+)\.meta\.json$/u)?.[1];
        const target = parts.find((candidate) => candidate.path.includes(`agent-${agentId}.jsonl`));
        if (target) target.sidecar = object;
      }
    } catch (error) { throw new MalformedAdapterInputError("claude", String(error)); }
    const traceTitle = "Claude session"; const sentMessages = new Set<string>(); const asyncJoins = new Set<string>();
    const allRecords = parts.flatMap((part) => part.records.map((record) => ({ part, record }))).sort((left, right) => String(objectRecord(left.record.value)?.timestamp ?? "").localeCompare(String(objectRecord(right.record.value)?.timestamp ?? "")) || left.record.line - right.record.line);
    for (const { part, record } of allRecords) {
      const object = objectRecord(record.value);
      if (!object || typeof object.type !== "string") { yield { type: "warning", code: "unknown_record", message: `line ${record.line} has no type` }; continue; }
      const declaredVersion = typeof object.version === "string" ? object.version : undefined; const version = declaredVersion?.startsWith("claude-jsonl-") ? declaredVersion : "claude-jsonl-v1";
      if (!this.manifest.supportedFormatVersions.includes(version)) throw new UnsupportedAdapterVersionError("claude", version);
      const eventId = stringValue(object.uuid) ?? stringValue(object.id) ?? `${part.lane}-${record.line}`;
      if (!supportedRecordTypes.has(object.type)) { yield { type: "warning", code: "unsupported_record_omitted", message: `line ${record.line} ${object.type} was omitted`, sourceEventId: eventId }; continue; }
      const sanitized = sanitizeClaudeValue(object); const sanitizedObject = objectRecord(sanitized.value) ?? { type: object.type };
      if (sanitized.omitted > 0) yield { type: "warning", code: "sensitive_reasoning_omitted", message: `line ${record.line} omitted ${sanitized.omitted} sensitive block(s)`, sourceEventId: eventId };
      const display = claudeDisplay(object.type, sanitizedObject); const attributes: Record<string, unknown> = { recordType: object.type, contentType: display.contentType, ...(display.toolName ? { toolName: display.toolName } : {}) };
      const message = objectRecord(object.message); const content = message?.content;
      const blocks = Array.isArray(content) ? content.map((item) => objectRecord(item)).filter((item): item is Record<string, unknown> => item !== null) : [];
      const agentId = part.lane;
      const toolUseId = stringValue(part.sidecar?.toolUseId);
      if (toolUseId && agentId !== rootSession) { attributes.parentAgentId = stringValue(part.sidecar?.parentAgentId) ?? rootSession; attributes.topologyProvenance = "stated"; }
      const toolResult = objectRecord(object.toolUseResult);
      if (toolResult && stringValue(toolResult.agentId)) { attributes.joinedBy = stringValue(toolResult.agentId)!; attributes.joinedAgentIds = [stringValue(toolResult.agentId)!]; }
      for (const block of blocks) {
        if (block.type === "tool_use" && block.name === "SendMessage") {
          const to = stringValue(objectRecord(block.input)?.to); if (to) { attributes.senderAgentId = agentId; attributes.recipientAgentId = to; attributes.messageId = eventId; attributes.topologyProvenance = "inferred"; sentMessages.add(`${agentId}\0${to}\0${eventId}`); }
        }
      }
      if (typeof content === "string" && object.origin && objectRecord(object.origin)?.kind === "task-notification") {
        const taskId = content.match(/<task-id>([^<]+)</u)?.[1]; const taskToolId = content.match(/<tool-use-id>([^<]+)</u)?.[1];
        if (taskId && taskToolId && parts.some((candidate) => candidate.lane === taskId) && !asyncJoins.has(`${taskId}\0${taskToolId}`)) { asyncJoins.add(`${taskId}\0${taskToolId}`); attributes.joinedBy = taskId; attributes.joinedAgentIds = [taskId]; }
      }
      const parentSpanId = toolUseId && agentId !== rootSession ? toolUseId : undefined;
      const status = object.is_error === true || object.isApiErrorMessage === true || Boolean(object.error) ? "error" : "ok";
      yield { type: "event", event: normalizeEvent({ source: "claude", formatVersion: version, adapterVersion: this.manifest.adapterVersion, sourceIdentity: input.sourceIdentity, sessionId: `${rootSession}@${this.manifest.adapterVersion}`, line: record.line }, { sourceEventId: eventId, occurredAt: typeof object.timestamp === "string" ? object.timestamp : undefined, kind: claudeKind(object.type, sanitizedObject), name: display.name, status, agentId, parentSpanId, attributes, payload: sanitizedObject, traceTitle }) };
      yield { type: "artifact", key: `event-${eventId}`, sourceEventId: eventId, bytes: new TextEncoder().encode(JSON.stringify(sanitizedObject)), mediaType: "application/json" };
    }
  }
}
