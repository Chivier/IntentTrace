import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { z } from "zod";

export interface ReadinessResult {
  ready: boolean;
  postgres: "ok" | "error" | "skipped";
  redis: "ok" | "error" | "skipped";
}

export interface BuildAppOptions {
  logger?: FastifyServerOptions["logger"];
  readiness?: () => Promise<ReadinessResult>;
  version?: string;
  gitCommit?: string;
}

const HealthSchema = z
  .object({ service: z.literal("api"), status: z.literal("ok"), gate: z.literal(0) })
  .strict();
const ReadySchema = z
  .object({
    service: z.literal("api"),
    status: z.enum(["ready", "degraded"]),
    dependencies: z.object({ postgres: z.string(), redis: z.string() }).strict(),
  })
  .strict();
const VersionSchema = z
  .object({
    service: z.literal("api"),
    version: z.string(),
    gitCommit: z.string(),
    schemaVersion: z.literal("1.0.0"),
  })
  .strict();

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      void reply.status(400).send({
        type: "https://intenttrace.local/problems/validation",
        title: "Request validation failed",
        status: 400,
        code: "validation_failed",
        requestId: request.id,
      });
      return;
    }
    request.log.error({ err: error }, "request failed");
    void reply.status(500).send({
      type: "https://intenttrace.local/problems/internal",
      title: "Internal server error",
      status: 500,
      code: "internal_error",
      requestId: request.id,
    });
  });

  void app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "IntentTrace API",
        description: "Implemented Gate 0 routes only. Planned trace APIs are not exposed.",
        version: options.version ?? "0.0.0",
      },
      servers: [{ url: "http://127.0.0.1:3001", description: "loopback development" }],
    },
    transform: jsonSchemaTransform,
  });
  void app.register(swaggerUi, { routePrefix: "/documentation" });

  void app.register(async function implementedRoutes(routes) {
    routes.get(
      "/healthz",
      {
        schema: {
          operationId: "getHealth",
          summary: "Process liveness",
          response: { 200: HealthSchema },
        },
      },
      async () => ({ service: "api" as const, status: "ok" as const, gate: 0 as const }),
    );

    routes.get(
      "/readyz",
      {
        schema: {
          operationId: "getReadiness",
          summary: "PostgreSQL and Redis readiness",
          response: { 200: ReadySchema, 503: ReadySchema },
        },
      },
      async (_request, reply) => {
        const result = await (options.readiness?.() ??
          Promise.resolve({
            ready: true,
            postgres: "skipped" as const,
            redis: "skipped" as const,
          }));
        if (!result.ready) reply.status(503);
        return {
          service: "api" as const,
          status: result.ready ? ("ready" as const) : ("degraded" as const),
          dependencies: { postgres: result.postgres, redis: result.redis },
        };
      },
    );

    routes.get(
      "/version",
      {
        schema: {
          operationId: "getVersion",
          summary: "Build and schema version",
          response: { 200: VersionSchema },
        },
      },
      async () => ({
        service: "api" as const,
        version: options.version ?? "0.0.0",
        gitCommit: options.gitCommit ?? "development",
        schemaVersion: "1.0.0" as const,
      }),
    );
  });

  return app;
}
