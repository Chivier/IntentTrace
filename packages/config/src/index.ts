import { resolve } from "node:path";

import { z } from "zod";

const BooleanStringSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

export const RuntimeConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  APP_VERSION: z.string().min(1).default("0.0.0"),
  GIT_COMMIT: z.string().min(1).default("development"),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://intenttrace:intenttrace@127.0.0.1:15432/intenttrace"),
  REDIS_URL: z.string().url().default("redis://127.0.0.1:16379"),
  ARTIFACT_ROOT: z
    .string()
    .min(1)
    .default(".intenttrace/artifacts")
    .transform((value) => resolve(value)),
  PROVIDER_MODE: z.literal("mock").default("mock"),
  PROVIDER_EGRESS_ENABLED: BooleanStringSchema,
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const parsed = RuntimeConfigSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => issue.path.join(".") || "environment")
      .join(", ");
    throw new Error(`Invalid IntentTrace configuration: ${fields}`);
  }
  if (parsed.data.PROVIDER_EGRESS_ENABLED) {
    throw new Error("Provider egress is locked during Gate 0");
  }
  return parsed.data;
}
