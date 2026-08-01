import { loadRuntimeConfig } from "@intenttrace/config";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

import { SUMMARY_QUEUE_NAME } from "./policy.js";

const config = loadRuntimeConfig();
const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(SUMMARY_QUEUE_NAME, { connection });
let shuttingDown = false;
let keepAlive: NodeJS.Timeout | undefined;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  if (keepAlive) clearInterval(keepAlive);
  process.stdout.write(`IntentTrace worker received ${signal}; closing queue connection.\n`);
  await queue.close();
  await connection.quit().catch(() => undefined);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).finally(() => {
      process.exitCode = 0;
    });
  });
}

try {
  await queue.waitUntilReady();
  process.stdout.write(
    `IntentTrace worker connected to ${SUMMARY_QUEUE_NAME}; Gate 0 job consumption and provider egress are disabled.\n`,
  );
  keepAlive = setInterval(() => undefined, 60_000);
} catch (error) {
  process.stderr.write(`IntentTrace worker failed to connect: ${String(error)}\n`);
  await shutdown("startup-failure");
  process.exitCode = 1;
}
