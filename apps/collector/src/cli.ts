import { stat, watch } from "node:fs/promises";
import { basename, join } from "node:path";

import {
  buildCompletionMarker,
  classifySessionFailure,
  redactCatalogEntry,
  type SessionFailureCode,
} from "@intenttrace/adapters";
import {
  IngestResultSchema,
  SessionCatalogIdSchema,
  SessionCatalogSchema,
  SessionImportOutcomeSchema,
  SessionImportSummarySchema,
  type IngestResult,
  type RawTraceEventInput,
  type TraceSourceKind,
} from "@intenttrace/schema";

import { loadCheckpoint, saveCheckpoint } from "./checkpoint.js";
import { validateExplicitPath, type ValidatedExplicitPath } from "./path-policy.js";
import {
  discoverSessionFiles,
  sessionCatalogId,
  type SessionFileCandidate,
  type SessionFileDiscovery,
} from "./session-discovery.js";
import { prepareSession, type PreparedSession } from "./session-preflight.js";

export const HELP_TEXT = `IntentTrace Collector

Usage:
  intenttrace discover --source jsonl|otlp|codex|claude --path <path> [--limit <n>]
                       [--max-file-mib <n>] [--include-previews]
  intenttrace import --source jsonl|otlp|codex|claude --path <path> [--api <origin>]
                     [--session <opaque-id> ...] [--max-files <n>] [--concurrency <n>]
                     [--newest] [--max-file-mib <n>] [--dry-run] [--include-previews]
  intenttrace follow --source codex|claude --path <path> [--api <origin>]
  intenttrace --help

The collector reads only the explicit path, refuses symlink boundaries, and sends normalized facts to the local API.

A directory --path is walked recursively (Codex stores sessions under YYYY/MM/DD, Claude under one
directory per project), reading only ${"`.jsonl`/`.ndjson`"} regular files and never following symlinks.
Discover returns a sanitized, recent-first catalog with opaque IDs, project hints, activity, event
and warning counts. It sends no data. --include-previews explicitly opts into bounded visible prompt
previews on stdout. Import --session selects catalog IDs
and may be repeated. Every file is completely parsed and validated before its first fact is sent.
Each file becomes its own trace, so files import concurrently while events inside one file stay ordered.
--max-files caps the batch and the skipped count is always reported, never silently dropped.
--newest keeps the most recently modified files when the cap applies; the default import order is by path.
--dry-run performs the same preflight as discover without sending anything to the API.
`;

type Command = "discover" | "import" | "follow";
const importSources = new Set<TraceSourceKind>(["jsonl", "otlp", "codex", "claude"]);
const followSources = new Set<TraceSourceKind>(["codex", "claude"]);
const DEFAULT_DISCOVER_LIMIT = 50;
const DEFAULT_MAX_FILE_MIB = 64;
const DEFAULT_MAX_FILES = 5_000;
const DEFAULT_CONCURRENCY = 4;
const PROGRESS_EVERY = 25;

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positiveIntegerOption(
  args: readonly string[],
  name: string,
  fallback: number,
  max: number,
): number {
  const raw = optionValue(args, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return value;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  if (normalized === "localhost" || normalized === "::1") return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(normalized);
  return Boolean(
    ipv4 && ipv4.slice(1).every((part) => Number(part) <= 255) && Number(ipv4[1]) === 127,
  );
}

function parseSource(value: string): TraceSourceKind {
  if (value === "jsonl" || value === "otlp" || value === "codex" || value === "claude") {
    return value;
  }
  throw new Error("Unsupported source; expected jsonl, otlp, codex, or claude");
}

export interface CollectorDependencies {
  fetch: typeof globalThis.fetch;
  output: (line: string) => void;
  environment: NodeJS.ProcessEnv;
}

const defaultDependencies: CollectorDependencies = {
  fetch: globalThis.fetch,
  output: (line) => process.stdout.write(`${line}\n`),
  environment: process.env,
};

function optionValues(args: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    values.push(value);
  }
  return values;
}

type PublicDiagnosticCode = SessionFailureCode | "api_rejected";
interface PublicDiagnostic {
  code: PublicDiagnosticCode;
  message: string;
}

function publicError(error: unknown): PublicDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /^API rejected event \(([1-5][0-9]{2})\)$/u.test(message) ||
    message === "API request failed" ||
    message === "API returned an invalid ingestion response"
  ) {
    return { code: "api_rejected", message };
  }
  return classifySessionFailure(error);
}

export function formatCollectorFatalError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code && /^[A-Z0-9_]+$/u.test(code)) {
    return `Unable to access the explicitly authorized path (${code})`;
  }
  const message = error instanceof Error ? error.message : String(error);
  const safeArgumentError =
    /^(?:Unknown command;|Unsupported source;|Source .+ is not supported for|discover requires|import requires|follow requires|--[a-z-]+ (?:requires|must)|Symbolic-link paths are refused|Session |API |Collector API origin)/u;
  if (safeArgumentError.test(message)) return message.replaceAll(/\s+/gu, " ").slice(0, 500);
  return publicError(error).message;
}

/** Runs `worker` over `items` with a bounded number of in-flight tasks. */
async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
}

async function ingestPreparedSession(
  prepared: PreparedSession,
  apiOrigin: string,
  markComplete: boolean,
  command: "import" | "follow",
  dependencies: CollectorDependencies,
): Promise<{ inserted: number; duplicates: number; warnings: number; traceId: string }> {
  let inserted = 0;
  let duplicates = 0;
  let ingestWarnings = 0;

  const send = async (event: RawTraceEventInput): Promise<void> => {
    let response: Response;
    try {
      response = await dependencies.fetch(new URL("/api/v1/events", apiOrigin), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error("API request failed");
    }
    if (!response.ok) {
      throw new Error(`API rejected event (${response.status})`);
    }
    let result: IngestResult;
    try {
      result = IngestResultSchema.parse((await response.json()) as unknown);
    } catch {
      throw new Error("API returned an invalid ingestion response");
    }
    if (result.duplicate) duplicates += 1;
    else inserted += 1;
    ingestWarnings += result.warnings.length;
  };

  for (const warning of prepared.warnings) {
    dependencies.output(
      JSON.stringify({
        level: "warning",
        command,
        sessionId: prepared.candidate.id,
        code: warning.code,
        message: warning.message,
      }),
    );
  }
  for (const event of prepared.events) await send(event);

  const lastEvent = prepared.events.at(-1);
  if (markComplete && lastEvent) {
    await send(buildCompletionMarker(lastEvent, prepared.contentSha256));
  }
  return {
    inserted,
    duplicates,
    warnings: prepared.warnings.length + ingestWarnings,
    traceId: prepared.events[0]!.traceId,
  };
}

export interface ImportOptions {
  maxFiles: number;
  concurrency: number;
  newestFirst: boolean;
  dryRun: boolean;
  selectedSessionIds: ReadonlySet<string>;
  includePreviews: boolean;
  maxFileBytes: number;
}

async function inspectCatalog(
  source: TraceSourceKind,
  discovered: SessionFileDiscovery,
  concurrency: number,
  maxFileBytes: number,
): Promise<{
  sessions: PreparedSession["descriptor"][];
  failures: Array<{ candidate: SessionFileCandidate; diagnostic: PublicDiagnostic }>;
}> {
  const descriptorsByIndex: Array<PreparedSession["descriptor"] | undefined> = [];
  const failures: Array<{ candidate: SessionFileCandidate; diagnostic: PublicDiagnostic }> = [];
  await mapWithConcurrency(discovered.candidates, concurrency, async (candidate, index) => {
    try {
      // Retain only the bounded catalog descriptor. Full events become eligible
      // for collection before the next candidate batch is imported.
      descriptorsByIndex[index] = (
        await prepareSession(source, candidate, maxFileBytes)
      ).descriptor;
    } catch (error) {
      failures.push({ candidate, diagnostic: publicError(error) });
    }
  });
  return {
    sessions: descriptorsByIndex.filter(
      (entry): entry is PreparedSession["descriptor"] => entry !== undefined,
    ),
    failures: failures.sort((left, right) =>
      left.candidate.relativePath.localeCompare(right.candidate.relativePath),
    ),
  };
}

function outputCatalog(input: {
  command: "discover" | "import";
  source: TraceSourceKind;
  discovered: SessionFileDiscovery;
  sessions: readonly PreparedSession["descriptor"][];
  failures: ReadonlyArray<{ candidate: SessionFileCandidate; diagnostic: PublicDiagnostic }>;
  dryRun?: boolean;
  includePreviews: boolean;
  dependencies: CollectorDependencies;
}): void {
  input.dependencies.output(
    JSON.stringify(
      SessionCatalogSchema.parse({
        catalogVersion: 1,
        command: input.command,
        source: input.source,
        ...(input.dryRun ? { dryRun: true } : {}),
        matchedFiles: input.discovered.matchedFiles,
        selectedFiles: input.discovered.candidates.length,
        sessions: input.sessions.map((session) =>
          redactCatalogEntry(session, input.includePreviews),
        ),
        failed: input.failures.map((failure) => ({
          id: failure.candidate.id,
          code: failure.diagnostic.code,
          message: failure.diagnostic.message,
        })),
        skippedByLimit: input.discovered.skippedByLimit,
        unreadableDirectories: input.discovered.unreadableDirectories,
        rejectedFiles: input.discovered.rejectedFiles,
        missingSessionIds: input.discovered.missingSessionIds,
      }),
    ),
  );
}

async function discoverPath(
  source: TraceSourceKind,
  path: ValidatedExplicitPath,
  limit: number,
  includePreviews: boolean,
  maxFileBytes: number,
  dependencies: CollectorDependencies,
): Promise<number> {
  const discovered = await discoverSessionFiles({
    source,
    root: path,
    limit,
    newestFirst: true,
  });
  const catalog = await inspectCatalog(source, discovered, DEFAULT_CONCURRENCY, maxFileBytes);
  outputCatalog({
    command: "discover",
    source,
    discovered,
    ...catalog,
    includePreviews,
    dependencies,
  });
  return (catalog.sessions.length === 0 && catalog.failures.length > 0) ||
    discovered.rejectedFiles > 0
    ? 1
    : 0;
}

async function importPath(
  source: TraceSourceKind,
  path: ValidatedExplicitPath,
  apiOrigin: string,
  options: ImportOptions,
  dependencies: CollectorDependencies,
): Promise<number> {
  const discovered = await discoverSessionFiles({
    source,
    root: path,
    limit: options.maxFiles,
    newestFirst: options.newestFirst,
    ...(options.selectedSessionIds.size > 0
      ? { selectedSessionIds: options.selectedSessionIds }
      : {}),
  });
  if (options.dryRun) {
    const catalog = await inspectCatalog(
      source,
      discovered,
      options.concurrency,
      options.maxFileBytes,
    );
    outputCatalog({
      command: "import",
      source,
      discovered,
      ...catalog,
      dryRun: true,
      includePreviews: options.includePreviews,
      dependencies,
    });
    return catalog.failures.length > 0 ||
      discovered.missingSessionIds.length > 0 ||
      discovered.rejectedFiles > 0
      ? 1
      : 0;
  }

  const totals = {
    files: discovered.candidates.length,
    imported: 0,
    failed: 0,
    inserted: 0,
    duplicates: 0,
    warnings: 0,
  };
  let firstError: string | null = null;

  await mapWithConcurrency(discovered.candidates, options.concurrency, async (candidate) => {
    try {
      const prepared = await prepareSession(source, candidate, options.maxFileBytes);
      const result = await ingestPreparedSession(prepared, apiOrigin, true, "import", dependencies);
      totals.imported += 1;
      totals.inserted += result.inserted;
      totals.duplicates += result.duplicates;
      totals.warnings += result.warnings;
      dependencies.output(
        JSON.stringify(
          SessionImportOutcomeSchema.parse({
            protocolVersion: 1,
            level: "result",
            command: "import",
            sessionId: candidate.id,
            traceId: result.traceId,
            inserted: result.inserted,
            duplicates: result.duplicates,
            warnings: result.warnings,
          }),
        ),
      );
    } catch (error) {
      totals.failed += 1;
      const diagnostic = publicError(error);
      firstError ??= diagnostic.message;
      dependencies.output(
        JSON.stringify({
          level: "error",
          command: "import",
          sessionId: candidate.id,
          code: diagnostic.code,
          message: diagnostic.message,
        }),
      );
    }
    const done = totals.imported + totals.failed;
    if (done % PROGRESS_EVERY === 0 && done < discovered.candidates.length) {
      dependencies.output(
        JSON.stringify({ level: "progress", done, of: discovered.candidates.length, ...totals }),
      );
    }
  });

  dependencies.output(
    JSON.stringify(
      SessionImportSummarySchema.parse({
        protocolVersion: 1,
        level: "summary",
        command: "import",
        source,
        ...totals,
        matchedFiles: discovered.matchedFiles,
        skippedByLimit: discovered.skippedByLimit,
        unreadableDirectories: discovered.unreadableDirectories,
        rejectedFiles: discovered.rejectedFiles,
        missingSessionIds: discovered.missingSessionIds,
        ...(firstError ? { firstError } : {}),
      }),
    ),
  );
  return totals.failed > 0 ||
    discovered.missingSessionIds.length > 0 ||
    discovered.rejectedFiles > 0
    ? 1
    : 0;
}

async function followPath(
  source: TraceSourceKind,
  path: ValidatedExplicitPath,
  apiOrigin: string,
  stateRoot: string,
  once: boolean,
  dependencies: CollectorDependencies,
): Promise<void> {
  if (path.kind !== "file") throw new Error("follow requires an explicitly named regular file");
  let checkpoint = await loadCheckpoint(stateRoot, source, path.realPath);

  const cycle = async (): Promise<void> => {
    const info = await stat(path.realPath);
    const fileIdentity = `${info.dev}:${info.ino}`;
    const rotated = checkpoint !== null && checkpoint.fileIdentity !== fileIdentity;
    const truncated = checkpoint !== null && info.size < checkpoint.byteOffset;
    if (!checkpoint || rotated || truncated || info.size > checkpoint.byteOffset) {
      const candidate: SessionFileCandidate = {
        id: sessionCatalogId(
          source,
          path.realPath,
          ".",
          info.size,
          info.mtimeMs,
          `${info.dev}:${info.ino}`,
        ),
        filePath: path.realPath,
        relativePath: ".",
        byteLength: info.size,
        modifiedAt: info.mtime.toISOString(),
        modifiedAtMs: info.mtimeMs,
        fileIdentity: `${info.dev}:${info.ino}`,
        normalizationIdentity: basename(path.realPath)
          .replace(/[^A-Za-z0-9_.:-]/gu, "-")
          .slice(0, 128),
      };
      const prepared = await prepareSession(source, candidate, DEFAULT_MAX_FILE_MIB * 1024 * 1024);
      const result = await ingestPreparedSession(
        prepared,
        apiOrigin,
        false,
        "follow",
        dependencies,
      );
      checkpoint = await saveCheckpoint(stateRoot, source, path.realPath, info);
      const publicCheckpoint = {
        schemaVersion: checkpoint.schemaVersion,
        source: checkpoint.source,
        fileIdentity: checkpoint.fileIdentity,
        byteOffset: checkpoint.byteOffset,
        prefixHash: checkpoint.prefixHash,
        updatedAt: checkpoint.updatedAt,
      };
      dependencies.output(
        JSON.stringify(
          SessionImportOutcomeSchema.parse({
            protocolVersion: 1,
            level: "result",
            command: "follow",
            sessionId: candidate.id,
            traceId: result.traceId,
            inserted: result.inserted,
            duplicates: result.duplicates,
            warnings: result.warnings,
          }),
        ),
      );
      dependencies.output(
        JSON.stringify({
          command: "follow.checkpoint",
          source,
          sessionId: candidate.id,
          rotated,
          truncated,
          checkpoint: publicCheckpoint,
        }),
      );
    }
  };

  await cycle();
  if (once) return;
  const watcher = watch(path.realPath, { persistent: true });
  for await (const event of watcher) {
    void event;
    await cycle();
  }
}

export async function runCollector(
  rawArgs: readonly string[],
  dependencies: CollectorDependencies = defaultDependencies,
): Promise<number> {
  // pnpm versions differ on whether the script separator is consumed. Keep old
  // documented `dev -- import` invocations working while new docs omit it.
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    dependencies.output(HELP_TEXT.trimEnd());
    return 0;
  }

  const command = args[0] as Command;
  if (command !== "discover" && command !== "import" && command !== "follow") {
    throw new Error("Unknown command; use intenttrace --help");
  }
  const sourceValue = optionValue(args, "--source");
  const inputPath = optionValue(args, "--path");
  if (!sourceValue || !inputPath) throw new Error(`${command} requires --source and --path`);
  const source = parseSource(sourceValue);
  const allowedSources = command === "follow" ? followSources : importSources;
  if (!allowedSources.has(source))
    throw new Error(`Source ${source} is not supported for ${command}`);

  const validatedPath = await validateExplicitPath(inputPath);
  if (command === "discover") {
    return await discoverPath(
      source,
      validatedPath,
      positiveIntegerOption(args, "--limit", DEFAULT_DISCOVER_LIMIT, 5_000),
      args.includes("--include-previews"),
      positiveIntegerOption(args, "--max-file-mib", DEFAULT_MAX_FILE_MIB, 2_048) * 1024 * 1024,
      dependencies,
    );
  }

  const apiOrigin =
    optionValue(args, "--api") ??
    dependencies.environment.INTENTTRACE_API_ORIGIN ??
    "http://127.0.0.1:3001";
  const parsedOrigin = new URL(apiOrigin);
  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    throw new Error("--api must use http or https");
  }
  if (!isLoopbackHostname(parsedOrigin.hostname)) {
    throw new Error("Collector API origin must be loopback in the local MVP");
  }
  if (command === "import") {
    return await importPath(
      source,
      validatedPath,
      parsedOrigin.origin,
      {
        maxFiles: positiveIntegerOption(args, "--max-files", DEFAULT_MAX_FILES, 100_000),
        concurrency: positiveIntegerOption(args, "--concurrency", DEFAULT_CONCURRENCY, 32),
        newestFirst: args.includes("--newest"),
        dryRun: args.includes("--dry-run"),
        includePreviews: args.includes("--include-previews"),
        maxFileBytes:
          positiveIntegerOption(args, "--max-file-mib", DEFAULT_MAX_FILE_MIB, 2_048) * 1024 * 1024,
        selectedSessionIds: new Set(
          optionValues(args, "--session").map((id) => {
            const parsed = SessionCatalogIdSchema.safeParse(id);
            if (!parsed.success) {
              throw new Error("--session must be a 24-character lowercase opaque catalog ID");
            }
            return parsed.data;
          }),
        ),
      },
      dependencies,
    );
  } else {
    const stateRoot =
      dependencies.environment.INTENTTRACE_COLLECTOR_STATE ??
      join(process.cwd(), ".intenttrace", "collector");
    await followPath(
      source,
      validatedPath,
      parsedOrigin.origin,
      stateRoot,
      args.includes("--once"),
      dependencies,
    );
  }
  return 0;
}
