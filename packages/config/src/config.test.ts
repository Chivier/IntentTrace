import { describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "./index.js";

describe("runtime config", () => {
  it("is mock-only and loopback by default", () => {
    const config = loadRuntimeConfig({});
    expect(config.API_HOST).toBe("127.0.0.1");
    expect(config.PROVIDER_MODE).toBe("mock");
    expect(config.PROVIDER_EGRESS_ENABLED).toBe(false);
  });

  it("fails closed when provider egress is enabled", () => {
    expect(() => loadRuntimeConfig({ PROVIDER_EGRESS_ENABLED: "true" })).toThrow(
      "Provider egress is locked",
    );
  });
});
