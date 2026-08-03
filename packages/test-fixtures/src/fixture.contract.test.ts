import { describe, expect, it } from "vitest";

import { RawTraceEventSchema } from "@intenttrace/schema";

import {
  acceptanceFixtureManifest,
  foundationRawEvent,
  generateAcceptanceFixture,
} from "./index.js";

describe("fixture policy", () => {
  it("locks the six-agent acceptance narrative", () => {
    expect(acceptanceFixtureManifest.agents).toHaveLength(6);
    expect(acceptanceFixtureManifest.minimumEventCount).toBe(2000);
    expect(RawTraceEventSchema.parse(foundationRawEvent)).toEqual(foundationRawEvent);
  });

  it("generates a deterministic 2k-event multi-agent acceptance trace", () => {
    const first = generateAcceptanceFixture();
    const second = generateAcceptanceFixture();
    expect(first).toHaveLength(2048);
    expect(second).toEqual(first);
    expect(new Set(first.map((event) => event.agentId))).toEqual(
      new Set(acceptanceFixtureManifest.agents),
    );
    expect(first.some((event) => event.kind === "error")).toBe(true);
    expect(first.some((event) => event.kind === "correction")).toBe(true);
    expect(first.some((event) => event.kind === "agent_handoff")).toBe(true);
    expect(first.at(-1)?.kind).toBe("trace_complete");
  });
});
