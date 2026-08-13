import { readFileSync, readdirSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { RawTraceEventInputSchema, RawTraceEventSchema } from "@intenttrace/schema";

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

describe("recorded demo trace", () => {
  const lines = readFileSync(
    new URL("../fixtures/demo/imo-2025-p1-parallel-solve.jsonl", import.meta.url),
    "utf8",
  )
    .split("\n")
    .filter((line) => line.trim().length > 0);

  it("is canonical, single-trace and complete", () => {
    const events = lines.map((line) => RawTraceEventInputSchema.parse(JSON.parse(line)));
    expect(events).toHaveLength(231);
    expect(new Set(events.map((event) => event.traceId)).size).toBe(1);
    expect(new Set(events.map((event) => event.source.sourceEventId)).size).toBe(events.length);
    expect(new Set(events.map((event) => event.agentId).filter(Boolean)).size).toBe(6);
    expect(events.some((event) => event.status === "error")).toBe(true);
    expect(events.at(-1)?.kind).toBe("trace_complete");
    expect(
      events.every((event) => event.traceTitle === "IMO 2025 P1 solved by six parallel agents"),
    ).toBe(true);
  });

  it("carries no host paths and no reasoning content", () => {
    const blob = lines.join("\n");
    expect(blob).not.toMatch(/\/home\//u);
    expect(blob).not.toMatch(/"thinking"/u);
  });
});
describe("topology fixture policy", () => {
  it("rejects host paths, secrets, reasoning, and raw encrypted content in topology fixtures", () => {
    const sources = ["codex", "claude", "opencode", "omp", "grok"];
    for (const source of sources) {
      const root = new URL(`../fixtures/${source}/topology/`, import.meta.url);
      const files = readdirSync(root, { recursive: true, encoding: "utf8" })
        .map((file) => new URL(String(file), root))
        .filter((file) => statSync(file).isFile());
      for (const file of files) {
        const text = readFileSync(file, "latin1");
        expect(text).not.toMatch(/\/home\/|[A-Z]:\\/u);
        expect(text).not.toMatch(/(?:api[_-]?key|authorization|secret|password)\s*[:=]/iu);
        expect(text).not.toMatch(/"(?:thinking|reasoning|agent_thought_chunk|thinkingSignature)"\s*:/u);
        expect(text).not.toMatch(/gAAAA[A-Za-z0-9_-]{8,}/u);
      }
    }
  });
});
