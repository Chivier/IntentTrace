import { constants } from "node:fs";
import { open } from "node:fs/promises";

import { prepareSessionParts, type PreparedSessionWarning } from "@intenttrace/adapters";
import type { RawTraceEventInput, SessionCatalogEntry, TraceSourceKind } from "@intenttrace/schema";

import type { SessionFileCandidate } from "./session-discovery.js";

export type { PreparedSessionWarning };

export interface PreparedSession {
  candidate: SessionFileCandidate;
  contentSha256: string;
  bytes: Uint8Array;
  events: RawTraceEventInput[];
  warnings: PreparedSessionWarning[];
  descriptor: SessionDescriptor;
  completionMarker: RawTraceEventInput;
}

export type SessionDescriptor = SessionCatalogEntry;

/**
 * Parse and validate the complete source before the caller sends its first raw
 * fact. This prevents a malformed tail from leaving a partially imported trace.
 */
export async function prepareSession(
  source: TraceSourceKind,
  candidate: SessionFileCandidate,
  maxFileBytes: number,
): Promise<PreparedSession> {
  if (candidate.byteLength > maxFileBytes) {
    throw new Error("Session exceeds the configured file-size limit");
  }
  const handle = await open(candidate.filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let bytes: Uint8Array;
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      `${info.dev}:${info.ino}` !== candidate.fileIdentity ||
      info.size !== candidate.byteLength ||
      Math.trunc(info.mtimeMs) !== Math.trunc(candidate.modifiedAtMs)
    ) {
      throw new Error("Session changed after discovery; refresh the catalog");
    }
    bytes = await handle.readFile();
    const afterRead = await handle.stat();
    if (
      `${afterRead.dev}:${afterRead.ino}` !== candidate.fileIdentity ||
      afterRead.size !== candidate.byteLength ||
      Math.trunc(afterRead.mtimeMs) !== Math.trunc(candidate.modifiedAtMs)
    ) {
      throw new Error("Session changed after discovery; refresh the catalog");
    }
  } finally {
    await handle.close();
  }
  const prepared = await prepareSessionParts(
    source,
    [{ path: candidate.relativePath, bytes }],
    candidate.normalizationIdentity,
    {
      id: candidate.id,
      byteLength: candidate.byteLength,
      modifiedAt: candidate.modifiedAt,
    },
  );
  if (prepared.length !== 1) throw new Error("Session bundle contains multiple logical traces");
  const trace = prepared[0]!;
  return {
    candidate,
    bytes,
    contentSha256: trace.contentSha256,
    events: trace.events.map(({ event }) => event),
    warnings: trace.warnings,
    descriptor: trace.descriptor,
    completionMarker: trace.completionMarker,
  };
}
