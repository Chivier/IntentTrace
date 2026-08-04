import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CanonicalJsonlAdapter,
  ClaudeSessionAdapter,
  CodexSessionAdapter,
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
    expect(events).toHaveLength(3);
    expect(events.some((record) => record.event.kind === "tool_result")).toBe(true);
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
});
