import { RawTraceEventInputSchema } from "@intenttrace/schema";

import {
  decodeAdapterBytes,
  objectRecord,
  readSessionRecords,
  type SessionRecord,
} from "./common.js";
import {
  MalformedAdapterInputError,
  singleAdapterPart,
  UnsupportedAdapterVersionError,
  type AdapterInput,
  type AdapterManifest,
  type AdapterRecord,
  type TraceAdapter,
} from "./types.js";

export class CanonicalJsonlAdapter implements TraceAdapter {
  readonly manifest: AdapterManifest = {
    source: "jsonl",
    adapterVersion: "1.0.0",
    supportedFormatVersions: ["1.0.0"],
    status: "implemented",
    topology: {
      spawn: "passthrough",
      join: "passthrough",
      peerMessages: "passthrough",
      input: "single-file",
      laneKey: "agentId",
      limits: [
        "Topology requires explicit canonical fields; passthrough never infers a missing relationship.",
      ],
    },
  };

  async sniff(input: AdapterInput): Promise<boolean> {
    const part = singleAdapterPart(input);
    try {
      const first = readSessionRecords(decodeAdapterBytes(part.bytes))[0]?.value;
      return RawTraceEventInputSchema.safeParse(first).success;
    } catch {
      return false;
    }
  }

  async *parse(input: AdapterInput): AsyncIterable<AdapterRecord> {
    const part = singleAdapterPart(input);
    let records: SessionRecord[];
    try {
      records = readSessionRecords(decodeAdapterBytes(part.bytes));
    } catch (error) {
      throw new MalformedAdapterInputError("jsonl", String(error));
    }
    for (const record of records) {
      const object = objectRecord(record.value);
      const version = object?.schemaVersion;
      if (typeof version === "string" && !this.manifest.supportedFormatVersions.includes(version)) {
        throw new UnsupportedAdapterVersionError("jsonl", version);
      }
      const parsed = RawTraceEventInputSchema.safeParse(record.value);
      if (!parsed.success) {
        throw new MalformedAdapterInputError(
          "jsonl",
          `line ${record.line}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
        );
      }
      yield { type: "event", event: parsed.data };
      const artifactKey = `event-${parsed.data.source.sourceEventId}`;
      yield {
        key: artifactKey,
        type: "artifact",
        sourceEventId: parsed.data.source.sourceEventId,
        bytes: record.bytes,
        mediaType: "application/json",
      };
    }
  }
}
