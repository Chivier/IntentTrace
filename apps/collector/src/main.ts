#!/usr/bin/env node
import { runCollector } from "./cli.js";

try {
  process.exitCode = await runCollector(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`intenttrace: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
