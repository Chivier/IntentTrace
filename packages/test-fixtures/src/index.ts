import { SchemaVersion, type RawTraceEvent } from "@intenttrace/schema";

export const acceptanceFixtureManifest = {
  id: "six-agent-repair-v1",
  seed: 20260801,
  minimumEventCount: 2000,
  agents: ["orchestrator", "research", "backend", "frontend", "summarizer", "test"],
  requiredNarrative: [
    "parallel",
    "handoff",
    "malformed_trace_id",
    "failure",
    "repair",
    "join",
    "final_result",
  ],
  implementationGate: 1,
} as const;

export const foundationRawEvent: RawTraceEvent = {
  schemaVersion: SchemaVersion,
  id: "019fbbb3-4324-7d43-8f9c-cd489a92cb28",
  workspaceId: "019fbbb3-4324-7d43-8f9c-cd489a92cb29",
  projectId: "019fbbb3-4324-7d43-8f9c-cd489a92cb30",
  traceId: "019fbbb3-4324-7d43-8f9c-cd489a92cb31",
  source: {
    kind: "jsonl",
    formatVersion: "1",
    adapterVersion: "0.0.0",
    sourceInstanceId: "foundation-fixture",
    sourceEventId: "request-1",
  },
  ingestSeq: "1",
  occurredAt: "2026-08-01T00:00:00.000Z",
  ingestedAt: "2026-08-01T00:00:00.001Z",
  kind: "user_message",
  name: "Request IntentTrace foundation",
  status: "ok",
  artifactRefs: [],
  attributes: {},
};
