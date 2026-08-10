import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import { SchemaVersion, type RawTraceEventInput } from "@intenttrace/schema";

import { buildApp } from "./app.js";
import type { ApiServices } from "./services.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const traceId = "33333333-3333-4333-8333-333333333333";
const eventInput: RawTraceEventInput = {
  schemaVersion: SchemaVersion,
  workspaceId,
  projectId,
  traceId,
  source: {
    kind: "jsonl",
    formatVersion: "1.0.0",
    adapterVersion: "1.0.0",
    sourceInstanceId: "test",
    sourceEventId: "event-1",
  },
  occurredAt: "2026-08-03T00:00:00.000Z",
  kind: "user_message",
  name: "Start trace",
  status: "ok",
  artifactRefs: [],
  attributes: {},
  payload: { safe: true },
};
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function services(order: string[]): ApiServices {
  let sequence = 0;
  return {
    repository: {
      ensureTrace: async () => {
        order.push("ensureTrace");
      },
      registerArtifact: async (input) => {
        order.push("registerArtifact");
        return { id: "44444444-4444-4444-8444-444444444444", redacted: false, ...input };
      },
      getArtifact: async () => {
        throw new Error("unused");
      },
      ingest: async (input) => {
        order.push("ingest");
        sequence += 1;
        const event = { ...input };
        delete event.workspaceName;
        delete event.projectName;
        delete event.traceTitle;
        delete event.payload;
        return {
          event: {
            ...event,
            id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
            ingestSeq: String(sequence),
            ingestedAt: "2026-08-03T00:00:01.000Z",
          },
          duplicate: false,
          traceStale: false,
        };
      },
      listTraces: async () => ({ traces: [], nextCursor: null }),
      listTracesByIds: async () => [],
      getTrace: async () => {
        throw new Error("unused");
      },
      listRawEvents: async () => ({ events: [], nextCursor: null }),
      getAgentTimeline: async () => [],
      listStreamEvents: async () => [],
      getStreamBounds: async () => ({ earliest: null, latest: null }),
      listProviderCalls: async () => [],
      listRevisions: async () => [],
      getGraph: async () => null,
      editSemanticNode: async () => {
        throw new Error("unused");
      },
      deleteTraceData: async () => undefined,
    },
    artifactStore: {
      put: async (input) => {
        order.push("putArtifact");
        return {
          traceId: input.traceId,
          sha256: "a".repeat(64),
          byteLength: input.bytes.byteLength,
          mediaType: input.mediaType,
        };
      },
      stat: async () => null,
      getRange: async () => new Uint8Array(),
      deleteTrace: async () => undefined,
    },
  };
}

describe("trace API integration boundary", () => {
  it("establishes the trace before registering the first payload artifact", async () => {
    const order: string[] = [];
    const app = buildApp({ services: services(order) });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      payload: eventInput,
    });
    expect(response.statusCode).toBe(201);
    expect(order).toEqual(["ensureTrace", "putArtifact", "registerArtifact", "ingest"]);
    expect(response.json().event.payloadRef.sha256).toBe("a".repeat(64));
  });

  it("accepts gzip OTLP HTTP JSON and returns partial-success shape", async () => {
    const order: string[] = [];
    const app = buildApp({ services: services(order) });
    apps.push(app);
    const payload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: "0af7651916cd43dd8448eb211c80319c",
                  spanId: "b7ad6b7169203331",
                  name: "test-span",
                  kind: 1,
                  startTimeUnixNano: "1785715200000000000",
                  endTimeUnixNano: "1785715201000000000",
                  status: { code: 1 },
                },
              ],
            },
          ],
        },
      ],
    };
    const response = await app.inject({
      method: "POST",
      url: "/v1/traces",
      headers: { "content-type": "application/json", "content-encoding": "gzip" },
      payload: gzipSync(JSON.stringify(payload)),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ partialSuccess: { rejectedSpans: 0, errorMessage: "" } });
    expect(order).toContain("ingest");
  });
});
