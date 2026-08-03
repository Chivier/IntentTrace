import type { RawTraceEventInput, TraceSourceKind } from "@intenttrace/schema";

export interface AdapterManifest {
  source: TraceSourceKind;
  adapterVersion: string;
  supportedFormatVersions: readonly string[];
  status: "implemented";
}

export interface AdapterInput {
  bytes: Uint8Array;
  sourceIdentity: string;
}

export type AdapterRecord =
  | { type: "event"; event: RawTraceEventInput }
  | { type: "artifact"; sourceEventId: string; bytes: Uint8Array; mediaType: string }
  | { type: "warning"; code: string; message: string; sourceEventId?: string }
  | { type: "checkpoint"; sourceIdentity: string; offset: number; prefixHash: string };

export interface TraceAdapter {
  readonly manifest: AdapterManifest;
  sniff(input: AdapterInput): Promise<boolean>;
  parse(input: AdapterInput): AsyncIterable<AdapterRecord>;
}

export class UnsupportedAdapterVersionError extends Error {
  readonly code = "unsupported_adapter_version";

  constructor(source: TraceSourceKind, formatVersion: string) {
    super(`Unsupported ${source} format version: ${formatVersion}`);
    this.name = "UnsupportedAdapterVersionError";
  }
}

export class MalformedAdapterInputError extends Error {
  readonly code = "malformed_adapter_input";

  constructor(source: TraceSourceKind, detail: string) {
    super(`Malformed ${source} input: ${detail}`);
    this.name = "MalformedAdapterInputError";
  }
}
