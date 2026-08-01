import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HELP_TEXT } from "../src/cli.js";
import { validateExplicitPath } from "../src/path-policy.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

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
});
