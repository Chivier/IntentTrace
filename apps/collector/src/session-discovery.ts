import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, sep } from "node:path";

import type { TraceSourceKind } from "@intenttrace/schema";

import type { ValidatedExplicitPath } from "./path-policy.js";

const TEXT_SESSION_EXTENSIONS = new Set([".jsonl", ".ndjson"]);

export interface SessionFileCandidate {
  id: string;
  filePath: string;
  relativePath: string;
  byteLength: number;
  modifiedAt: string;
  modifiedAtMs: number;
  fileIdentity: string;
  normalizationIdentity: string;
}

export interface SessionFileDiscovery {
  candidates: SessionFileCandidate[];
  matchedFiles: number;
  skippedByLimit: number;
  unreadableDirectories: number;
  rejectedFiles: number;
  missingSessionIds: string[];
}

function normalizationIdentity(filePath: string): string {
  return basename(filePath)
    .replace(/[^A-Za-z0-9_.:-]/gu, "-")
    .slice(0, 128);
}

function portableRelativePath(root: ValidatedExplicitPath, filePath: string): string {
  if (root.kind === "file") return ".";
  return relative(root.realPath, filePath).split(sep).join("/");
}

/**
 * Catalog IDs are opaque capabilities scoped to the operator-named root. They
 * intentionally contain neither an absolute path nor a provider-native session ID.
 */
export function sessionCatalogId(
  source: TraceSourceKind,
  authorizedRoot: string,
  relativePath: string,
  byteLength: number,
  modifiedAtMs: number,
  fileIdentity: string,
): string {
  return createHash("sha256")
    .update("intenttrace-session-catalog-v1")
    .update("\0")
    .update(source)
    .update("\0")
    .update(authorizedRoot)
    .update("\0")
    .update(relativePath)
    .update("\0")
    .update(String(byteLength))
    .update("\0")
    .update(String(Math.trunc(modifiedAtMs)))
    .update("\0")
    .update(fileIdentity)
    .digest("hex")
    .slice(0, 24);
}

async function walkSessionFiles(
  source: TraceSourceKind,
  directory: string,
  onUnreadable: () => void,
): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    onUnreadable();
    return [];
  }

  const files: string[] = [];
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) continue;
    const child = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkSessionFiles(source, child, onUnreadable)));
      continue;
    }
    const extension = extname(entry.name).toLowerCase();
    const accepted =
      source === "opencode"
        ? extension === ".db" || entry.name.endsWith("-wal") || entry.name.endsWith("-shm") || extension === ".json"
        : source === "grok"
          ? extension === ".json" || TEXT_SESSION_EXTENSIONS.has(extension)
          : source === "omp"
            ? TEXT_SESSION_EXTENSIONS.has(extension) || extension === ".json"
            : source === "claude"
              ? TEXT_SESSION_EXTENSIONS.has(extension) || entry.name.endsWith(".meta.json")
              : source === "otlp"
                ? extension === ".json"
                : TEXT_SESSION_EXTENSIONS.has(extension);
    if (entry.isFile() && accepted) {
      files.push(child);
    }
  }
  return files;
}

export async function discoverSessionFiles(input: {
  source: TraceSourceKind;
  root: ValidatedExplicitPath;
  limit: number;
  newestFirst: boolean;
  selectedSessionIds?: ReadonlySet<string>;
}): Promise<SessionFileDiscovery> {
  let unreadableDirectories = 0;
  let rejectedFiles = 0;
  const files =
    input.root.kind === "file"
      ? [input.root.realPath]
      : await walkSessionFiles(input.source, input.root.realPath, () => {
          unreadableDirectories += 1;
        });

  const described: Array<SessionFileCandidate | null> = Array.from(
    { length: files.length },
    () => null,
  );
  let cursor = 0;
  const workers = Array.from({ length: Math.min(32, files.length) }, async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      const filePath = files[index]!;
      try {
        const info = await lstat(filePath);
        if (!info.isFile() || info.isSymbolicLink()) {
          rejectedFiles += 1;
          continue;
        }
        const resolvedFile = await realpath(filePath);
        if (input.root.kind === "directory") {
          const boundaryRelative = relative(input.root.realPath, resolvedFile);
          if (
            boundaryRelative === ".." ||
            boundaryRelative.startsWith(`..${sep}`) ||
            isAbsolute(boundaryRelative)
          ) {
            rejectedFiles += 1;
            continue;
          }
        }
        const relativePath = portableRelativePath(input.root, resolvedFile);
        described[index] = {
          id: sessionCatalogId(
            input.source,
            input.root.realPath,
            relativePath,
            info.size,
            info.mtimeMs,
            `${info.dev}:${info.ino}`,
          ),
          filePath: resolvedFile,
          relativePath,
          byteLength: info.size,
          modifiedAt: info.mtime.toISOString(),
          modifiedAtMs: info.mtimeMs,
          fileIdentity: `${info.dev}:${info.ino}`,
          normalizationIdentity: normalizationIdentity(resolvedFile),
        };
      } catch {
        rejectedFiles += 1;
      }
    }
  });
  await Promise.all(workers);

  const allCandidates = described.filter(
    (candidate): candidate is SessionFileCandidate => candidate !== null,
  );
  const byId = new Map(allCandidates.map((candidate) => [candidate.id, candidate]));
  const missingSessionIds = input.selectedSessionIds
    ? [...input.selectedSessionIds].filter((id) => !byId.has(id)).sort()
    : [];
  const selected = input.selectedSessionIds
    ? allCandidates.filter((candidate) => input.selectedSessionIds!.has(candidate.id))
    : allCandidates;
  const ordered = selected.sort((left, right) =>
    input.newestFirst
      ? right.modifiedAtMs - left.modifiedAtMs ||
        left.relativePath.localeCompare(right.relativePath)
      : left.relativePath.localeCompare(right.relativePath),
  );

  return {
    candidates: ordered.slice(0, input.limit),
    matchedFiles: files.length,
    skippedByLimit: Math.max(0, ordered.length - input.limit),
    unreadableDirectories,
    rejectedFiles,
    missingSessionIds,
  };
}
