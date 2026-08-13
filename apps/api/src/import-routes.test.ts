import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import type { ApiServices } from "./services.js";

const fixtureRoot = resolve(import.meta.dirname, "../../../packages/test-fixtures/fixtures");

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

function services(order: string[], duplicate = false): ApiServices {
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
          },
          duplicate: false,
          traceStale: false,
          warnings: [],
        };
      },
      listTraces: async () => ({ traces: [], nextCursor: null }),
      listTracesByIds: async () => {
        order.push("listTracesByIds");
        return [];
      },
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
      put: async (input) => ({
        traceId: input.traceId,
        sha256: "a".repeat(64),
        byteLength: input.bytes.byteLength,
        mediaType: input.mediaType,
      }),
      stat: async () => null,
      getRange: async () => new Uint8Array(),
      deleteTrace: async () => undefined,
    },
  };
}

async function codexFixture(): Promise<Buffer> {
  return readFile(resolve(fixtureRoot, "codex/valid.jsonl"));
}

async function claudeFixture(): Promise<Buffer> {
  return readFile(resolve(fixtureRoot, "claude/valid.jsonl"));
}

async function inspect(
  app: ReturnType<typeof buildApp>,
  bytes: Buffer,
  includePreviews: boolean,
  fileName = "valid.jsonl",
) {
  return app.inject({
    method: "POST",
    url: "/api/v1/imports/candidates",
    payload: {
      protocolVersion: 1,
      includePreviews,
      candidates: [
        {
          clientRef: "c1",
          fileName,
          byteLength: bytes.byteLength,
          modifiedAt: "2026-08-01T00:00:00.000Z",
          headBase64: bytes.toString("base64"),
          complete: true,
        },
      ],
    },
  });
}

describe("browser session import routes", () => {
  it("redacts previews from candidate inspection by default", async () => {
    const app = buildApp({ services: services([]) });
    apps.push(app);
    const response = await inspect(app, await codexFixture(), false);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.alreadyImportedCount).toBe(0);
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0]).toMatchObject({
      clientRef: "c1",
      source: "codex",
      title: "Codex session",
      firstPromptPreview: null,
      lastPromptPreview: null,
      imported: false,
      failureCode: null,
    });
  });

  it("hides the derived title and prompt previews until previews are consented to", async () => {
    const app = buildApp({ services: services([]) });
    apps.push(app);
    const bytes = await claudeFixture();
    const hidden = (await inspect(app, bytes, false, "claude.jsonl")).json();
    expect(hidden.candidates[0]).toMatchObject({
      source: "claude",
      title: "Claude session",
      firstPromptPreview: null,
      lastPromptPreview: null,
    });

    const shown = (await inspect(app, bytes, true, "claude.jsonl")).json();
    expect(shown.candidates[0].title).toBe("Claude · Synthetic request");
    expect(shown.candidates[0].firstPromptPreview).toBe("Synthetic request");
  });

  it("imports an uploaded session and appends the completion marker", async () => {
    const order: string[] = [];
    const app = buildApp({ services: services(order) });
    apps.push(app);
    const bytes = await codexFixture();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/imports/sessions?source=auto&fileName=valid.jsonl",
      headers: { "content-type": "application/octet-stream" },
      payload: bytes,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.command).toBe("upload");
    expect(body.sessionId).toMatch(/^[a-f0-9]{24}$/u);
    // Three fixture events plus the content-hash `trace_complete` marker.
    expect(body.inserted).toBe(4);
    expect(body.duplicates).toBe(0);
    expect(order.filter((entry) => entry === "ingest")).toHaveLength(4);
  });

  it("reports every event as a duplicate when the same bytes were already imported", async () => {
    const first = buildApp({ services: services([]) });
    const second = buildApp({ services: services([], true) });
    apps.push(first, second);
    const bytes = await codexFixture();
    const url = "/api/v1/imports/sessions?source=auto&fileName=valid.jsonl";
    const headers = { "content-type": "application/octet-stream" };
    const original = (await first.inject({ method: "POST", url, headers, payload: bytes })).json();
    const repeat = (await second.inject({ method: "POST", url, headers, payload: bytes })).json();
    expect(repeat.inserted).toBe(0);
    expect(repeat.duplicates).toBe(4);
    expect(repeat.traceId).toBe(original.traceId);
    expect(repeat.sessionId).toBe(original.sessionId);
  });

  it("rejects unrecognizable bytes before ingesting anything", async () => {
    const order: string[] = [];
    const app = buildApp({ services: services(order) });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/imports/sessions?source=auto&fileName=broken.jsonl",
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.from("{ not json"),
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe("unknown_source_format");
    expect(order).toEqual([]);
  });

  it("answers a body over the configured cap with 413 payload_too_large", async () => {
    const app = buildApp({ services: services([]), uploadMaxBytes: 65_536 });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/imports/sessions?source=auto&fileName=big.jsonl",
      headers: { "content-type": "application/octet-stream" },
      payload: Buffer.alloc(70_000, 0x61),
    });
    expect(response.statusCode).toBe(413);
    expect(response.json().code).toBe("payload_too_large");
  });
});
