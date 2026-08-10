import { constants } from "node:fs";
import { open } from "node:fs/promises";

import { prepareSessionBytes, type PreparedSessionWarning } from "@intenttrace/adapters";
import type { RawTraceEventInput, SessionCatalogEntry, TraceSourceKind } from "@intenttrace/schema";

import type { SessionFileCandidate } from "./session-discovery.js";

export type { PreparedSessionWarning };

export interface PreparedSession {
  candidate: SessionFileCandidate;
  contentSha256: string;
  events: RawTraceEventInput[];
  warnings: PreparedSessionWarning[];
  descriptor: SessionDescriptor;
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
  // Keep the existing basename namespace stable; provider-native session IDs
  // remain the trace identity when the source format supplies one.
  const prepared = await prepareSessionBytes(source, bytes, candidate.normalizationIdentity, {
    id: candidate.id,
    byteLength: candidate.byteLength,
    modifiedAt: candidate.modifiedAt,
  });
  return { candidate, ...prepared };
}
