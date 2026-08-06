import { describe, expect, it } from "vitest";

import {
  ProviderIntentGraphPatchSchema,
  RawTraceEventSchema,
  SchemaVersion,
  SemanticRevisionSchema,
  SessionCatalogSchema,
  SessionImportOutcomeSchema,
  SessionImportSummarySchema,
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

describe("SessionCatalog contract", () => {
  it("accepts only bounded opaque discovery descriptors", () => {
    expect(
      SessionCatalogSchema.parse({
        catalogVersion: 1,
        command: "discover",
        source: "claude",
        matchedFiles: 1,
        selectedFiles: 1,
        sessions: [
          {
            id: "a".repeat(24),
            source: "claude",
            title: "Review checkout flow",
            projectHint: "storefront",
            firstPromptPreview: "Review checkout flow",
            lastPromptPreview: "Fix the failing test",
            lastActivityAt: "2026-08-01T00:00:00.000Z",
            byteLength: 1024,
            eventCount: 8,
            warningCount: 1,
            modifiedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
        failed: [],
        skippedByLimit: 0,
        unreadableDirectories: 0,
        rejectedFiles: 0,
        missingSessionIds: [],
      }).sessions,
    ).toHaveLength(1);
  });

  it("accepts a path-free per-session import outcome", () => {
    expect(
      SessionImportOutcomeSchema.parse({
        protocolVersion: 1,
        level: "result",
        command: "import",
        sessionId: "c".repeat(24),
        traceId: ids.trace,
        inserted: 8,
        duplicates: 0,
        warnings: 1,
      }).traceId,
    ).toBe(ids.trace);
  });

  it("accepts a deterministic aggregate import summary", () => {
    expect(
      SessionImportSummarySchema.parse({
        protocolVersion: 1,
        level: "summary",
        command: "import",
        source: "codex",
        files: 2,
        imported: 1,
        failed: 1,
        inserted: 8,
        duplicates: 0,
        warnings: 1,
        matchedFiles: 4,
        skippedByLimit: 2,
        unreadableDirectories: 0,
        rejectedFiles: 0,
        missingSessionIds: [],
        firstError: "Session preflight failed; no events were imported",
      }).failed,
    ).toBe(1);
  });

  it("rejects native paths and extra descriptor fields", () => {
    expect(() =>
      SessionCatalogSchema.parse({
        catalogVersion: 1,
        command: "discover",
        source: "codex",
        matchedFiles: 1,
        selectedFiles: 1,
        sessions: [
          {
            id: "b".repeat(24),
            source: "codex",
            title: "Session",
            projectHint: null,
            firstPromptPreview: null,
            lastPromptPreview: null,
            lastActivityAt: "2026-08-01T00:00:00.000Z",
            byteLength: 1,
            eventCount: 1,
            warningCount: 0,
            modifiedAt: "2026-08-01T00:00:00.000Z",
            nativePath: "/private/session.jsonl",
          },
        ],
        failed: [],
        skippedByLimit: 0,
        unreadableDirectories: 0,
        rejectedFiles: 0,
        missingSessionIds: [],
      }),
    ).toThrow();
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
