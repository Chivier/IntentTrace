import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CanonicalJsonlAdapter,
  ClaudeSessionAdapter,
  CodexSessionAdapter,
  detectSourceKind,
  MalformedAdapterInputError,
  OtlpHttpJsonAdapter,
  UnsupportedAdapterVersionError,
  type AdapterRecord,
  type TraceAdapter,
} from "../src/index.js";

const fixtureRoot = resolve(import.meta.dirname, "../../test-fixtures/fixtures");

async function fixture(source: string, name: string): Promise<Uint8Array> {
  return readFile(resolve(fixtureRoot, source, name));
}

async function parse(adapter: TraceAdapter, bytes: Uint8Array): Promise<AdapterRecord[]> {
  const records: AdapterRecord[] = [];
  for await (const record of adapter.parse({ bytes, sourceIdentity: "anonymous-fixture" })) {
    records.push(record);
  }
  return records;
}

describe("implemented trace adapters", () => {
  it("parses canonical JSONL and preserves duplicate source identities", async () => {
    const adapter = new CanonicalJsonlAdapter();
    const records = await parse(adapter, await fixture("jsonl", "duplicate.jsonl"));
    const events = records.filter((record) => record.type === "event");
    expect(events).toHaveLength(2);
    expect(events[0]?.event.source.sourceEventId).toBe(events[1]?.event.source.sourceEventId);
  });

  it("parses OTLP HTTP JSON and gzip", async () => {
    const adapter = new OtlpHttpJsonAdapter();
    const bytes = await fixture("otlp", "valid.json");
    expect((await parse(adapter, bytes)).filter((record) => record.type === "event")).toHaveLength(
      1,
    );
    expect(
      (await parse(adapter, gzipSync(bytes))).filter((record) => record.type === "event"),
    ).toHaveLength(1);
  });

  it("parses Codex session records and reports unknown records", async () => {
    const adapter = new CodexSessionAdapter();
    const records = await parse(adapter, await fixture("codex", "valid.jsonl"));
    expect(records.filter((record) => record.type === "event")).toHaveLength(3);
    const unknown = await parse(adapter, await fixture("codex", "unknown-record.jsonl"));
    expect(unknown.some((record) => record.type === "warning")).toBe(true);
  });

  it("omits Codex reasoning, encrypted blocks, and world state from events and artifacts", async () => {
    const records = await parse(new CodexSessionAdapter(), await fixture("codex", "privacy.jsonl"));
    const events = records.filter((record) => record.type === "event");
    expect(events).toHaveLength(4);
    expect(events.some((record) => record.event.kind === "tool_result")).toBe(true);
    expect(events.some((record) => record.event.name.includes("Visible answer"))).toBe(true);
    expect(events.some((record) => record.event.name.includes("visible.txt"))).toBe(true);
    expect(events.some((record) => record.event.name.includes("Tool result: read_file"))).toBe(
      true,
    );
    expect(new Set(events.map((record) => record.event.traceId))).toHaveLength(1);
    expect(events[0]?.event.source.adapterVersion).toBe("2.0.0");
    expect(
      records.filter(
        (record) => record.type === "warning" && record.code === "sensitive_reasoning_omitted",
      ),
    ).toHaveLength(1);
    const serialized = records
      .map((record) =>
        record.type === "artifact"
          ? new TextDecoder().decode(record.bytes)
          : JSON.stringify(record),
      )
      .join("\n");
    expect(serialized).toContain("Visible answer");
    expect(serialized).not.toContain("must-not-persist");
  });

  it("parses Claude records including visible errors", async () => {
    const adapter = new ClaudeSessionAdapter();
    const records = await parse(adapter, await fixture("claude", "error.jsonl"));
    const event = records.find((record) => record.type === "event");
    expect(event?.type === "event" ? event.event.status : null).toBe("error");
  });

  it("accepts Claude client versions while omitting thinking and file snapshots", async () => {
    const adapter = new ClaudeSessionAdapter();
    const bytes = await fixture("claude", "privacy.jsonl");
    await expect(adapter.sniff({ bytes, sourceIdentity: "anonymous-fixture" })).resolves.toBe(true);
    const records = await parse(adapter, bytes);
    expect(records.filter((record) => record.type === "event")).toHaveLength(3);
    const events = records.filter((record) => record.type === "event");
    expect(events.some((record) => record.event.name.includes("Visible request"))).toBe(true);
    expect(events.some((record) => record.event.name.includes("Visible answer"))).toBe(true);
    expect(events[0]?.event.source.adapterVersion).toBe("2.0.0");
    expect(
      records.filter(
        (record) => record.type === "warning" && record.code === "sensitive_reasoning_omitted",
      ),
    ).toHaveLength(1);
    const serialized = records
      .map((record) =>
        record.type === "artifact"
          ? new TextDecoder().decode(record.bytes)
          : JSON.stringify(record),
      )
      .join("\n");
    expect(serialized).toContain("Visible answer");
    expect(serialized).not.toContain("must-not-persist");
  });

  it.each([
    [new CanonicalJsonlAdapter(), "jsonl", "unsupported.jsonl"],
    [new OtlpHttpJsonAdapter(), "otlp", "unsupported.json"],
    [new CodexSessionAdapter(), "codex", "unsupported.jsonl"],
    [new ClaudeSessionAdapter(), "claude", "unsupported.jsonl"],
  ] as const)("fails visibly for unsupported %s versions", async (adapter, source, name) => {
    await expect(parse(adapter, await fixture(source, name))).rejects.toBeInstanceOf(
      UnsupportedAdapterVersionError,
    );
  });

  it("accepts a top-level JSON array as the same session as its JSONL form", async () => {
    const adapter = new ClaudeSessionAdapter();
    const lines = await parse(adapter, await fixture("claude", "valid.jsonl"));
    const array = await parse(adapter, await fixture("claude", "valid-array.json"));
    const lineEvents = lines.filter((record) => record.type === "event");
    const arrayEvents = array.filter((record) => record.type === "event");
    expect(arrayEvents).toHaveLength(lineEvents.length);
    expect(arrayEvents[0]?.event.traceId).toBe(lineEvents[0]?.event.traceId);
  });

  it("accepts a single pretty-printed JSON object as one record", async () => {
    const records = await parse(
      new CodexSessionAdapter(),
      await fixture("codex", "valid-single.json"),
    );
    expect(records.filter((record) => record.type === "event")).toHaveLength(1);
  });

  it("still reports the original line diagnostic for non-JSON input", async () => {
    const bytes = new TextEncoder().encode('{"type":"user"}\nnot json\n');
    await expect(parse(new ClaudeSessionAdapter(), bytes)).rejects.toBeInstanceOf(
      MalformedAdapterInputError,
    );
  });

  it.each([
    ["jsonl", "valid.jsonl", "jsonl"],
    ["otlp", "valid.json", "otlp"],
    ["codex", "valid.jsonl", "codex"],
    ["claude", "valid.jsonl", "claude"],
  ] as const)("detects %s fixtures", async (directory, name, expected) => {
    const bytes = await fixture(directory, name);
    await expect(detectSourceKind({ bytes, sourceIdentity: "fixture" })).resolves.toBe(expected);
  });

  it("returns null when no adapter recognizes the bytes", async () => {
    await expect(
      detectSourceKind({ bytes: Buffer.from("not json"), sourceIdentity: "fixture" }),
    ).resolves.toBeNull();
  });
});
