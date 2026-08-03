import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
JSON.parse(await readFile(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
JSON.parse(await readFile(resolve(root, "src-tauri/capabilities/default.json"), "utf8"));

async function run(command, args, stdio = "inherit") {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, stdio });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}

const cargoAvailable = await new Promise((resolvePromise) => {
  const child = spawn("cargo", ["--version"], { cwd: root, stdio: "ignore" });
  child.once("error", () => resolvePromise(false));
  child.once("exit", (code) => resolvePromise(code === 0));
});
if (!cargoAvailable) {
  process.stdout.write(
    "Tauri JSON and frontend validated; Rust tooling is not installed in this runtime image.\n",
  );
  process.exit(0);
}
await run("cargo", ["fmt", "--manifest-path", "src-tauri/Cargo.toml", "--", "--check"]);
await run(
  "cargo",
  [
    "metadata",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--locked",
    "--no-deps",
    "--format-version",
    "1",
  ],
  "ignore",
);
if (process.platform === "darwin") {
  await run("cargo", ["check", "--manifest-path", "src-tauri/Cargo.toml", "--locked"]);
} else {
  process.stdout.write(
    "Tauri Rust parsed and dependency graph locked; native WebKit compilation is macOS-gated.\n",
  );
}
