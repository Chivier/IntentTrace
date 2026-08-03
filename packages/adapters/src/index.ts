export * from "./types.js";
export * from "./common.js";
export * from "./jsonl.js";
export * from "./otlp.js";
export * from "./codex.js";
export * from "./claude.js";

import type { TraceSourceKind } from "@intenttrace/schema";

import { ClaudeSessionAdapter } from "./claude.js";
import { CodexSessionAdapter } from "./codex.js";
import { CanonicalJsonlAdapter } from "./jsonl.js";
import { OtlpHttpJsonAdapter } from "./otlp.js";
import type { TraceAdapter } from "./types.js";

export function createAdapter(source: TraceSourceKind): TraceAdapter {
  switch (source) {
    case "jsonl":
      return new CanonicalJsonlAdapter();
    case "otlp":
      return new OtlpHttpJsonAdapter();
    case "codex":
      return new CodexSessionAdapter();
    case "claude":
      return new ClaudeSessionAdapter();
    default:
      throw new Error(`No built-in adapter for ${source}`);
  }
}

export const adapterManifests = (["jsonl", "otlp", "codex", "claude"] as const).map(
  (source) => createAdapter(source).manifest,
);
