import { loadRuntimeConfig } from "@intenttrace/config";

import { validateExplicitPath } from "./path-policy.js";

export const HELP_TEXT = `IntentTrace Collector (Gate 0)\n\nUsage:\n  intenttrace import --source jsonl|otlp|codex|claude --path <path>\n  intenttrace follow --source codex|claude --path <path>\n  intenttrace --help\n\nGate 0 validates configuration and explicit path permissions only. It does not read session contents.\n`;

type Command = "import" | "follow";
const importSources = new Set(["jsonl", "otlp", "codex", "claude"]);
const followSources = new Set(["codex", "claude"]);

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export async function runCollector(args: readonly string[]): Promise<number> {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  const command = args[0] as Command;
  if (command !== "import" && command !== "follow")
    throw new Error(`Unknown command: ${args[0] ?? ""}`);
  const source = optionValue(args, "--source");
  const inputPath = optionValue(args, "--path");
  if (!source || !inputPath) throw new Error(`${command} requires --source and --path`);
  const allowedSources = command === "follow" ? followSources : importSources;
  if (!allowedSources.has(source))
    throw new Error(`Source ${source} is not supported for ${command}`);

  loadRuntimeConfig();
  const validatedPath = await validateExplicitPath(inputPath);
  process.stdout.write(
    `${JSON.stringify({ command, source, path: validatedPath.realPath, kind: validatedPath.kind, status: "validated_not_read" })}\n`,
  );
  return 0;
}
