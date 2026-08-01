import type { RawTraceEvent, TraceSourceKind } from "@intenttrace/schema";

export interface AdapterManifest {
  source: TraceSourceKind;
  adapterVersion: string;
  supportedFormatVersions: readonly string[];
  status: "foundation" | "implemented";
}

export type AdapterRecord =
  | { type: "event"; event: RawTraceEvent }
  | { type: "artifact"; sourceEventId: string; bytes: Uint8Array; mediaType: string }
  | { type: "warning"; code: string; message: string; sourceEventId?: string }
  | { type: "checkpoint"; sourceIdentity: string; offset: number; prefixHash: string };

export interface TraceAdapter<Input = unknown> {
  readonly manifest: AdapterManifest;
  sniff(input: Input): Promise<boolean>;
  parse(input: Input): AsyncIterable<AdapterRecord>;
}

export class UnsupportedAdapterVersionError extends Error {
  constructor(source: TraceSourceKind, formatVersion: string) {
    super(`Unsupported ${source} format version: ${formatVersion}`);
    this.name = "UnsupportedAdapterVersionError";
  }
}

export const adapterManifests: readonly AdapterManifest[] = [
  {
    source: "jsonl",
    adapterVersion: "0.0.0",
    supportedFormatVersions: ["1"],
    status: "foundation",
  },
  {
    source: "otlp",
    adapterVersion: "0.0.0",
    supportedFormatVersions: ["1.11-json"],
    status: "foundation",
  },
  { source: "codex", adapterVersion: "0.0.0", supportedFormatVersions: [], status: "foundation" },
  { source: "claude", adapterVersion: "0.0.0", supportedFormatVersions: [], status: "foundation" },
] as const;
