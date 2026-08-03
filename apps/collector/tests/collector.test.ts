import { mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HELP_TEXT, runCollector } from "../src/cli.js";
import { validateExplicitPath } from "../src/path-policy.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

function mockFetch() {
  let sequence = 0;
  return async (_input: string | URL | Request, init?: RequestInit) => {
    const event = JSON.parse(String(init?.body)) as Record<string, unknown>;
    delete event.workspaceName;
    delete event.projectName;
    delete event.traceTitle;
    delete event.payload;
    sequence += 1;
    return new Response(
      JSON.stringify({
        event: {
          ...event,
          id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
          ingestSeq: String(sequence),
          ingestedAt: "2026-08-03T00:00:00.000Z",
        },
        duplicate: false,
        traceStale: false,
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  };
}

describe("collector path boundary", () => {
  it("documents the fixed command surface", () => {
    expect(HELP_TEXT).toContain(
      "intenttrace import --source jsonl|otlp|codex|claude --path <path>",
    );
    expect(HELP_TEXT).toContain("intenttrace follow --source codex|claude --path <path>");
  });

  it("accepts an explicitly named regular file without reading it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "intenttrace-collector-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "session.jsonl");
    await writeFile(path, "secret-not-read-by-validator\n");
    await expect(validateExplicitPath(path)).resolves.toMatchObject({
      kind: "file",
      realPath: path,
    });
  });

  it("refuses a symlink as the explicit boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "intenttrace-collector-"));
    temporaryDirectories.push(directory);
    const target = join(directory, "target.jsonl");
    const link = join(directory, "link.jsonl");
    await writeFile(target, "fixture\n");
    await symlink(target, link);
    await expect(validateExplicitPath(link)).rejects.toThrow("Symbolic-link paths are refused");
  });

  it("imports normalized events through the API boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "intenttrace-collector-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "session.jsonl");
    await writeFile(
      path,
      '{"type":"session_meta","version":"codex-jsonl-v1","timestamp":"2026-08-01T00:00:00.000Z","payload":{"id":"session-1","agent_id":"orchestrator"}}\n',
    );
    const output: string[] = [];
    await expect(
      runCollector(["import", "--source", "codex", "--path", path], {
        fetch: mockFetch() as typeof fetch,
        output: (line) => output.push(line),
        environment: {},
      }),
    ).resolves.toBe(0);
    expect(output.at(-1)).toContain('"inserted":1');
  });

  it("records append, truncation, and rotation checkpoints without scanning directories", async () => {
    const directory = await mkdtemp(join(tmpdir(), "intenttrace-collector-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "session.jsonl");
    const state = join(directory, "state");
    const outputs: string[] = [];
    const dependencies = {
      fetch: mockFetch() as typeof fetch,
      output: (line: string) => outputs.push(line),
      environment: { INTENTTRACE_COLLECTOR_STATE: state },
    };
    const record = (id: string) =>
      `{"type":"session_meta","version":"codex-jsonl-v1","timestamp":"2026-08-01T00:00:00.000Z","payload":{"id":"${id}","agent_id":"orchestrator"}}\n`;
    await writeFile(path, record("session-with-a-long-identity"));
    await runCollector(["follow", "--source", "codex", "--path", path, "--once"], dependencies);
    await writeFile(path, record("session-2"));
    await runCollector(["follow", "--source", "codex", "--path", path, "--once"], dependencies);
    await rename(path, `${path}.rotated`);
    await writeFile(path, record("session-3"));
    await runCollector(["follow", "--source", "codex", "--path", path, "--once"], dependencies);
    expect(outputs.some((line) => line.includes('"truncated":true'))).toBe(true);
    expect(outputs.some((line) => line.includes('"rotated":true'))).toBe(true);
  });
});
