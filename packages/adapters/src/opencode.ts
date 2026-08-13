import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import type { RawEventKind } from "@intenttrace/schema";

import { displayName, displayPreview, normalizeEvent, objectRecord } from "./common.js";
import { normalizeAdapterInput, singleAdapterPart, UnsupportedAdapterVersionError, MalformedAdapterInputError, type AdapterInput, type AdapterManifest, type AdapterRecord, type TraceAdapter } from "./types.js";
import { lookupTopologyCapability } from "./topology.js";

interface SessionRow { id: string; parent_id: string | null; version: string; time_created: number; agent: string | null }
interface MessageRow { id: string; session_id: string; time_created: number; data: string }
interface PartRow { id: string; message_id: string; session_id: string; time_created: number; data: string }
function parseJson(value: unknown): Record<string, unknown> { if (typeof value !== "string") return objectRecord(value) ?? {}; try { return objectRecord(JSON.parse(value)) ?? {}; } catch { return {}; } }
function str(value: unknown): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
function eventKind(data: Record<string, unknown>): RawEventKind { if (data.type === "tool") return "tool_call"; if (data.type === "text") return "assistant_message"; return "log"; }
function partOutput(data: Record<string, unknown>): { child: string | null; status: string; output: string; legacy: boolean } {
  const state = objectRecord(data.state) ?? {}; const metadata = objectRecord(state.metadata) ?? {}; const output = String(state.output ?? "");
  const child = str(metadata.sessionId);
  return { child, status: String(state.status ?? "ok"), output, legacy: output.startsWith("task_id:") };
}
function taskEnvelope(output: string): { child: string | null; text: string; state: string } {
  const modern = output.match(/<task\s+id="([^"]+)"\s+state="([^"]+)"[^>]*>[\s\S]*?<task_(?:result|error)>\s*([\s\S]*?)(?:<\/task_(?:result|error)>|$)/iu);
  if (modern) return { child: modern[1]!, state: modern[2]!, text: modern[3]!.trim() };
  const legacy = output.match(/task_id:\s*([^\s]+)[\s\S]*?<task_result>\s*([\s\S]*?)(?:<\/task_result>|$)/iu);
  return legacy ? { child: legacy[1]!, state: "completed", text: legacy[2]!.trim() } : { child: null, state: "unknown", text: output.slice(0, 800) };
}
export class OpenCodeSessionAdapter implements TraceAdapter {
  readonly manifest: AdapterManifest = { source: "opencode", adapterVersion: "1.0.0", supportedFormatVersions: ["opencode-sqlite-v1"], status: "implemented", topology: lookupTopologyCapability("opencode", "1.0.0") };
  async sniff(input: AdapterInput): Promise<boolean> { try { return singleAdapterPart(input).bytes.length > 15 && new TextDecoder().decode(singleAdapterPart(input).bytes.subarray(0, 15)) === "SQLite format 3"; } catch { return false; } }
  async *parse(input: AdapterInput): AsyncIterable<AdapterRecord> {
    const normalized = normalizeAdapterInput(input); const dbPart = normalized.parts.find((part) => /(?:^|\/)opencode\.db$/u.test(part.path));
    if (!dbPart) throw new MalformedAdapterInputError("opencode", "bundle requires opencode.db");
    const work = await mkdtemp(join(tmpdir(), "intenttrace-opencode-"));
    try {
      await writeFile(join(work, "opencode.db"), dbPart.bytes);
      for (const name of ["opencode.db-wal", "opencode.db-shm"] as const) { const part = normalized.parts.find((candidate) => candidate.path === name || candidate.path.endsWith(`/${name}`)); if (part) await writeFile(join(work, name), part.bytes); }
      const overflow = new Map(normalized.parts.filter((part) => part.path.startsWith("tool-output/")).map((part) => [posix.basename(part.path), part.bytes]));
      const db = new DatabaseSync(join(work, "opencode.db"), { readOnly: true });
      try {
        const sessions = db.prepare("SELECT id,parent_id,version,time_created,agent FROM session ORDER BY time_created ASC, id ASC").all() as unknown as SessionRow[];
        const sessionIds = new Set(sessions.map((session) => session.id));
        const rootOf = (id: string): string => { const seen = new Set<string>(); let current = id; while (!seen.has(current)) { seen.add(current); const parent = sessions.find((session) => session.id === current)?.parent_id; if (!parent || !sessionIds.has(parent)) break; current = parent; } return current; };
        const roots = new Set(sessions.map((session) => rootOf(session.id))); const messages = db.prepare("SELECT id,session_id,time_created,data FROM message ORDER BY time_created ASC,id ASC").all() as unknown as MessageRow[];
        const parts = db.prepare("SELECT id,message_id,session_id,time_created,data FROM part ORDER BY time_created ASC,id ASC").all() as unknown as PartRow[];
        const messageById = new Map(messages.map((message) => [message.id, message])); const traceIds = new Map([...roots].map((root) => [root, root]));
        for (const session of sessions) {
          const root = rootOf(session.id); const event = normalizeEvent({ source: "opencode", formatVersion: "opencode-sqlite-v1", adapterVersion: this.manifest.adapterVersion, sourceIdentity: input.sourceIdentity, sessionId: `${traceIds.get(root) ?? root}@${this.manifest.adapterVersion}`, line: session.time_created }, { sourceEventId: `session-${session.id}`, occurredAt: new Date(session.time_created).toISOString(), kind: "agent_start", name: displayName("OpenCode session", session.agent ?? session.id), agentId: session.id, attributes: { recordType: "session", laneKey: session.id, ...(session.parent_id ? { parentAgentId: session.parent_id, topologyProvenance: "stated" } : {}) }, payload: { id: session.id, parent_id: session.parent_id, agent: session.agent }, traceTitle: "OpenCode session" });
          yield { type: "event", event }; yield { type: "artifact", key: `event-${event.source.sourceEventId}`, sourceEventId: event.source.sourceEventId, bytes: new TextEncoder().encode(JSON.stringify(event.payload ?? {})), mediaType: "application/json" };
        }
        for (const part of parts) {
          const message = messageById.get(part.message_id); if (!message) continue; const data = parseJson(part.data); const state = objectRecord(data.state) ?? {}; const metadata = objectRecord(state.metadata) ?? {}; const root = rootOf(part.session_id); const session = sessions.find((item) => item.id === part.session_id); const eventId = `part-${part.id}`; const task = data.type === "tool" && data.tool === "task"; const result = task ? partOutput(data) : null; let attributes: Record<string, unknown> = { recordType: "part", partType: String(data.type ?? "unknown") };
          if (task && result) {
            const envelope = taskEnvelope(result.output || (result.child ? `<task id="${result.child}" state="${result.status}"><task_result></task_result></task>` : "")); const child = result.child ?? envelope.child;
            if (child) { const parentSession = str(metadata.parentSessionId) ?? part.session_id; attributes = { ...attributes, parentAgentId: parentSession, spawnedAgentIds: [child], childSessionId: child, topologyProvenance: "stated" }; }
            if (envelope.child) { attributes = { ...attributes, joinedAgentIds: [envelope.child], joinedBy: envelope.child }; }
            if (result.output && result.output.includes("[Session persistence truncated large content]")) {
              const outputPath = str(objectRecord(objectRecord(data.state)?.metadata)?.outputPath); const key = outputPath ? posix.basename(outputPath) : null; const bytes = key ? overflow.get(key) : undefined;
              if (bytes) { attributes = { ...attributes, overflowRecovered: true }; yield { type: "warning", code: "truncated_output_overflow_used", message: "OpenCode truncated task output recovered from supplied overflow part", sourceEventId: eventId }; }
            }
          }
          const event = normalizeEvent({ source: "opencode", formatVersion: "opencode-sqlite-v1", adapterVersion: this.manifest.adapterVersion, sourceIdentity: input.sourceIdentity, sessionId: `${root}@${this.manifest.adapterVersion}`, line: part.time_created }, { sourceEventId: eventId, occurredAt: new Date(part.time_created).toISOString(), kind: task ? (result?.status === "error" ? "tool_result" : "tool_call") : eventKind(data), name: task ? displayName("OpenCode task", objectRecord(state.input)?.description ?? data.tool) : displayName("OpenCode part", data.type), status: task && result?.status === "error" ? "error" : "ok", agentId: part.session_id, spanId: task ? str(data.callID) ?? undefined : undefined, parentSpanId: task && attributes.parentAgentId ? str(data.callID) ?? undefined : undefined, attributes, payload: data, traceTitle: "OpenCode session" });
          yield { type: "event", event }; yield { type: "artifact", key: `event-${eventId}`, sourceEventId: eventId, bytes: new TextEncoder().encode(JSON.stringify(data)), mediaType: "application/json" };
        }
      } finally { db.close(); }
    } catch (error) {
      if (error instanceof MalformedAdapterInputError || error instanceof UnsupportedAdapterVersionError) throw error;
      throw new MalformedAdapterInputError("opencode", String(error));
    } finally { await rm(work, { recursive: true, force: true }); }
  }
}
