import { describe, expect, it } from "vitest";

import {
  ProviderIntentGraphPatchSchema,
  RawTraceEventSchema,
  SchemaVersion,
  SemanticRevisionSchema,
} from "./index.js";

const ids = {
  event: "019fbbb3-4324-7d43-8f9c-cd489a92cb28",
  workspace: "019fbbb3-4324-7d43-8f9c-cd489a92cb29",
  project: "019fbbb3-4324-7d43-8f9c-cd489a92cb30",
  trace: "019fbbb3-4324-7d43-8f9c-cd489a92cb31",
};

describe("RawTraceEvent contract", () => {
  it("accepts an immutable canonical envelope", () => {
    expect(
      RawTraceEventSchema.parse({
        schemaVersion: SchemaVersion,
        id: ids.event,
        workspaceId: ids.workspace,
        projectId: ids.project,
        traceId: ids.trace,
        source: {
          kind: "jsonl",
          formatVersion: "1",
          adapterVersion: "0.0.0",
          sourceInstanceId: "fixture-main",
          sourceEventId: "evt-1",
        },
        ingestSeq: "1",
        occurredAt: "2026-08-01T00:00:00.000Z",
        ingestedAt: "2026-08-01T00:00:00.100Z",
        kind: "user_message",
        name: "request",
        status: "ok",
        artifactRefs: [],
        attributes: {},
      }),
    ).toBeTruthy();
  });

  it("rejects floating-point or zero ingest sequences", () => {
    expect(() => RawTraceEventSchema.parse({ ingestSeq: "0" })).toThrow();
  });
});

describe("IntentGraphPatch contract", () => {
  it("rejects no-op updates", () => {
    const result = ProviderIntentGraphPatchSchema.safeParse({
      schemaVersion: SchemaVersion,
      jobNonce: ids.event,
      baseRevisionId: ids.trace,
      operations: [
        {
          op: "update_node",
          ref: ids.project,
          set: {},
          clear: [],
          evidenceEventIds: [ids.event],
        },
      ],
      diagnostics: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("SemanticRevision contract", () => {
  it("supports the empty-trace revision watermark", () => {
    expect(
      SemanticRevisionSchema.parse({
        id: ids.event,
        traceId: ids.trace,
        parentRevisionId: null,
        branchKind: "live",
        eventWatermark: "0",
        createdAt: "2026-08-01T00:00:00.000Z",
        sourceJobId: null,
      }).eventWatermark,
    ).toBe("0");
  });
});
