import { describe, expect, it } from "vitest";

import { RawTraceEventSchema } from "@intenttrace/schema";

import { acceptanceFixtureManifest, foundationRawEvent } from "./index.js";

describe("fixture policy", () => {
  it("locks the six-agent acceptance narrative", () => {
    expect(acceptanceFixtureManifest.agents).toHaveLength(6);
    expect(acceptanceFixtureManifest.minimumEventCount).toBe(2000);
    expect(RawTraceEventSchema.parse(foundationRawEvent)).toEqual(foundationRawEvent);
  });
});
