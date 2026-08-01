import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { buildApp } from "../src/app.js";

const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(here, "../../../docs/contracts/api/openapi.yaml");
const check = process.argv.includes("--check");
const app = buildApp({ version: "0.0.0", gitCommit: "generated" });
await app.ready();
const content = `# Generated from implemented Fastify routes. Do not edit manually.\n${YAML.stringify(app.swagger())}`;
await app.close();

if (check) {
  const existing = await readFile(output, "utf8").catch(() => "");
  if (existing !== content) {
    console.error("generated OpenAPI is stale");
    process.exitCode = 1;
  }
} else {
  await writeFile(output, content, "utf8");
}
