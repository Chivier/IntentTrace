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
        expect(text).not.toMatch(/(?:\/home\/|\/Users\/)(?!must-not-persist)|[A-Z]:\\/u);
        expect(text).not.toMatch(/(?:api[_-]?key|authorization|secret|password)\s*[:=]/iu);
        expect(text).not.toMatch(/"(?:thinking|reasoning|agent_thought_chunk|thinkingSignature)"\s*:\s*"(?!must-not-persist)/u);
        expect(text).not.toMatch(/gAAAA[A-Za-z0-9_-]{8,}/u);
      }
    }
  });

  it("only allows synthetic marker text inside hidden-content values", () => {
    const hiddenKeys = new Set(["thinking", "reasoning", "thinkingSignature", "signature", "encrypted_content", "systemPrompt"]);
    const marker = /^must-not-persist/u;
    const violations: string[] = [];
    const walk = (value: unknown, path: string, hiddenContext = false): void => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`, hiddenContext));
        return;
      }
      if (value === null || typeof value !== "object") {
        if (hiddenContext && typeof value === "string" && !marker.test(value)) violations.push(path);
        return;
      }
      const object = value as Record<string, unknown>;
      const block = object.type === "thinking" || object.type === "redacted_thinking" || object.type === "agent_thought_chunk" || object.type === "encrypted_content";
      for (const [key, item] of Object.entries(object)) {
        const discriminator = key === "type" && block;
        walk(item, `${path}.${key}`, discriminator ? false : hiddenContext || hiddenKeys.has(key) || block);
      }
    };
    for (const source of ["codex", "claude", "opencode", "omp", "grok"]) {
      const root = new URL(`../fixtures/${source}/topology/`, import.meta.url);
      const files = readdirSync(root, { recursive: true, encoding: "utf8" }).map((file) => new URL(String(file), root)).filter((file) => statSync(file).isFile() && /\.(?:jsonl|json)$/u.test(file.pathname));
      for (const file of files) for (const line of readFileSync(file, "utf8").split("\n").filter((entry) => entry.trim().length > 0)) {
        try { walk(JSON.parse(line), `${source}:${file.pathname.split("/").at(-1)}`); } catch { violations.push(`${source}: unparseable fixture line`); }
      }
    }
    expect(violations).toEqual([]);
    const directViolations: string[] = [];
    const directWalk = (value: unknown, path: string, hiddenContext = false): void => {
      if (Array.isArray(value)) return value.forEach((item, index) => directWalk(item, `${path}[${index}]`, hiddenContext));
      if (value === null || typeof value !== "object") { if (hiddenContext && typeof value === "string" && !marker.test(value)) directViolations.push(path); return; }
      const object = value as Record<string, unknown>; const block = object.type === "thinking" || object.type === "encrypted_content";
      for (const [key, item] of Object.entries(object)) directWalk(item, `${path}.${key}`, hiddenContext || hiddenKeys.has(key) || block);
    };
    directWalk({ thinking: { text: "real hidden" } }, "object");
    directWalk({ thinking: ["real hidden"] }, "array");
    directWalk({ type: "encrypted_content", value: "not-a-token" }, "encrypted");
    expect(directViolations.length).toBeGreaterThanOrEqual(2);
  });
});
