import { createHash } from "node:crypto";
import { readFile, readdir, stat, watch } from "node:fs/promises";
import { basename, join } from "node:path";

import { createAdapter } from "@intenttrace/adapters";
import {
  IngestResultSchema,
  RawTraceEventInputSchema,
  type RawTraceEventInput,
  type TraceSourceKind,
} from "@intenttrace/schema";

import { loadCheckpoint, saveCheckpoint } from "./checkpoint.js";
import { validateExplicitPath, type ValidatedExplicitPath } from "./path-policy.js";

export const HELP_TEXT = `IntentTrace Collector\n\nUsage:\n  intenttrace import --source jsonl|otlp|codex|claude --path <path> [--api <origin>]\n  intenttrace follow --source codex|claude --path <path> [--api <origin>]\n  intenttrace --help\n\nThe collector reads only the explicit path, refuses symlink boundaries, and sends normalized facts to the local API.\n`;

type Command = "import" | "follow";
const importSources = new Set<TraceSourceKind>(["jsonl", "otlp", "codex", "claude"]);
const followSources = new Set<TraceSourceKind>(["codex", "claude"]);

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseSource(value: string): TraceSourceKind {
  if (value === "jsonl" || value === "otlp" || value === "codex" || value === "claude") {
    return value;
  }
  throw new Error(`Unsupported source: ${value}`);
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

async function explicitFiles(path: ValidatedExplicitPath): Promise<string[]> {
  if (path.kind === "file") return [path.realPath];
  const entries = await readdir(path.realPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink())
    .map((entry) => join(path.realPath, entry.name))
    .sort();
}

async function ingestFile(
  source: TraceSourceKind,
  filePath: string,
  apiOrigin: string,
  markComplete: boolean,
  dependencies: CollectorDependencies,
): Promise<{ inserted: number; duplicates: number; warnings: number }> {
  const adapter = createAdapter(source);
  const bytes = await readFile(filePath);
  const sourceIdentity = basename(filePath)
    .replace(/[^A-Za-z0-9_.:-]/gu, "-")
    .slice(0, 128);
  let inserted = 0;
  let duplicates = 0;
  let warnings = 0;
  let lastEvent: RawTraceEventInput | null = null;

  const send = async (event: RawTraceEventInput): Promise<void> => {
    const response = await dependencies.fetch(new URL("/api/v1/events", apiOrigin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      const detail = JSON.stringify(payload);
      throw new Error(`API rejected ${event.source.sourceEventId} (${response.status}): ${detail}`);
    }
    const result = IngestResultSchema.parse(payload);
    if (result.duplicate) duplicates += 1;
    else inserted += 1;
  };

  for await (const record of adapter.parse({ bytes, sourceIdentity })) {
    if (record.type === "warning") {
      warnings += 1;
      dependencies.output(JSON.stringify({ level: "warning", ...record, path: filePath }));
      continue;
    }
    if (record.type !== "event") continue;
    const event = RawTraceEventInputSchema.parse(record.event);
    await send(event);
    lastEvent = event;
  }

  if (markComplete && lastEvent) {
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const completion = { ...lastEvent };
    delete completion.agentId;
    delete completion.spanId;
    delete completion.parentSpanId;
    delete completion.subjectId;
    delete completion.causationEventId;
    delete completion.payload;
    delete completion.payloadRef;
    await send(
      RawTraceEventInputSchema.parse({
        ...completion,
        source: {
          ...completion.source,
          sourceEventId: `import-complete-${contentHash.slice(0, 32)}`,
        },
        kind: "trace_complete",
        name: "Offline import complete",
        status: "ok",
        artifactRefs: [],
        attributes: {
          collectorMarker: "offline_import_complete",
          contentSha256: contentHash,
        },
      }),
    );
  }
  return { inserted, duplicates, warnings };
}

async function importPath(
  source: TraceSourceKind,
  path: ValidatedExplicitPath,
  apiOrigin: string,
  dependencies: CollectorDependencies,
): Promise<void> {
  const totals = { inserted: 0, duplicates: 0, warnings: 0, files: 0 };
  for (const file of await explicitFiles(path)) {
    const result = await ingestFile(source, file, apiOrigin, true, dependencies);
    totals.files += 1;
    totals.inserted += result.inserted;
    totals.duplicates += result.duplicates;
    totals.warnings += result.warnings;
  }
  dependencies.output(
    JSON.stringify({ command: "import", source, path: path.realPath, ...totals }),
  );
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
      const result = await ingestFile(source, path.realPath, apiOrigin, false, dependencies);
      checkpoint = await saveCheckpoint(stateRoot, source, path.realPath, info);
      dependencies.output(
        JSON.stringify({
          command: "follow",
          source,
          path: path.realPath,
          rotated,
          truncated,
          ...result,
          checkpoint,
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
  args: readonly string[],
  dependencies: CollectorDependencies = defaultDependencies,
): Promise<number> {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    dependencies.output(HELP_TEXT.trimEnd());
    return 0;
  }

  const command = args[0] as Command;
  if (command !== "import" && command !== "follow") {
    throw new Error(`Unknown command: ${args[0] ?? ""}`);
  }
  const sourceValue = optionValue(args, "--source");
  const inputPath = optionValue(args, "--path");
  if (!sourceValue || !inputPath) throw new Error(`${command} requires --source and --path`);
  const source = parseSource(sourceValue);
  const allowedSources = command === "follow" ? followSources : importSources;
  if (!allowedSources.has(source))
    throw new Error(`Source ${source} is not supported for ${command}`);

  const apiOrigin =
    optionValue(args, "--api") ??
    dependencies.environment.INTENTTRACE_API_ORIGIN ??
    "http://127.0.0.1:3001";
  const parsedOrigin = new URL(apiOrigin);
  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    throw new Error("--api must use http or https");
  }
  const validatedPath = await validateExplicitPath(inputPath);
  if (command === "import")
    await importPath(source, validatedPath, parsedOrigin.origin, dependencies);
  else {
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
