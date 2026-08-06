import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

describe("generated OpenAPI", () => {
  it("contains only implemented routes, including raw and semantic MVP contracts", async () => {
    const app = buildApp();
    await app.ready();
    const document = app.swagger();
    expect(Object.keys(document.paths ?? {}).sort()).toEqual([
      "/api/v1/events",
      "/api/v1/traces",
      "/api/v1/traces/{traceId}",
      "/api/v1/traces/{traceId}/artifacts/{artifactId}",
      "/api/v1/traces/{traceId}/events",
      "/api/v1/traces/{traceId}/graph",
      "/api/v1/traces/{traceId}/nodes/{nodeId}",
      "/api/v1/traces/{traceId}/provider-calls",
      "/api/v1/traces/{traceId}/revisions",
      "/api/v1/traces/{traceId}/snapshot",
      "/api/v1/traces/{traceId}/stream",
      "/healthz",
      "/metrics",
      "/readyz",
      "/v1/traces",
      "/version",
    ]);
    await app.close();
  });
});
