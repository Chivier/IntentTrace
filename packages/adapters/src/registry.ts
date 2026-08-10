import type { TraceSourceKind } from "@intenttrace/schema";

import { ClaudeSessionAdapter } from "./claude.js";
import { CodexSessionAdapter } from "./codex.js";
import { CanonicalJsonlAdapter } from "./jsonl.js";
import { OtlpHttpJsonAdapter } from "./otlp.js";
import type { AdapterInput, TraceAdapter } from "./types.js";

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

// jsonl first: its sniff is a full Zod match of the canonical envelope, so it
// cannot false-positive. otlp next: `resourceSpans` is unambiguous. codex and
// claude have disjoint record-type vocabularies; the order between them is
// fixed only for determinism.
const detectionOrder = ["jsonl", "otlp", "codex", "claude"] as const;

export async function detectSourceKind(input: AdapterInput): Promise<TraceSourceKind | null> {
  for (const source of detectionOrder) {
    if (await createAdapter(source).sniff(input)) return source;
  }
  return null;
}
