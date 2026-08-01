import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

describe("generated OpenAPI", () => {
  it("contains implemented routes and excludes planned trace routes", async () => {
    const app = buildApp();
    await app.ready();
    const document = app.swagger();
    expect(Object.keys(document.paths ?? {}).sort()).toEqual(["/healthz", "/readyz", "/version"]);
    expect(document.paths?.["/api/v1/traces"]).toBeUndefined();
    await app.close();
  });
});
