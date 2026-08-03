import { describe, expect, it } from "vitest";

import { adapterManifests } from "../src/index.js";

describe("adapter registry contract", () => {
  it("registers every locked MVP source as an implemented adapter", () => {
    expect(adapterManifests.map((manifest) => manifest.source)).toEqual([
      "jsonl",
      "otlp",
      "codex",
      "claude",
    ]);
    expect(adapterManifests.every((manifest) => manifest.status === "implemented")).toBe(true);
  });
});
