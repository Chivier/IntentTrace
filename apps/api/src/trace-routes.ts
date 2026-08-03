import { setTimeout as delay } from "node:timers/promises";

import { OtlpHttpJsonAdapter } from "@intenttrace/adapters";
import {
  IntegrityConflictError,
  RepositoryNotFoundError,
  StaleSummaryJobError,
} from "@intenttrace/db";
import {
  HumanNodeEditSchema,
  IngestResultSchema,
  OtlpPartialSuccessSchema,
  ProviderCallAuditListSchema,
  RawEventPageSchema,
  RawTraceEventInputSchema,
  SemanticGraphSnapshotSchema,
  TraceListSchema,
  TraceSnapshotSchema,
  TraceSummarySchema,
  UuidSchema,
} from "@intenttrace/schema";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { ApiServices } from "./services.js";

const TraceParamsSchema = z.object({ traceId: UuidSchema }).strict();
const ArtifactParamsSchema = TraceParamsSchema.extend({ artifactId: UuidSchema }).strict();
const NodeParamsSchema = TraceParamsSchema.extend({ nodeId: UuidSchema }).strict();
const EventQuerySchema = z
  .object({
    after: z.coerce.number().int().nonnegative().default(0),
    limit: z.coerce.number().int().min(1).max(1000).default(200),
  })
  .strict();
const TraceListQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
  .strict();
const GraphQuerySchema = z.object({ revisionId: UuidSchema.optional() }).strict();
const ArtifactQuerySchema = z
  .object({
    offset: z.coerce.number().int().nonnegative().default(0),
    length: z.coerce.number().int().min(1).max(8_388_608).default(1_048_576),
  })
  .strict();
const StreamQuerySchema = z
  .object({
    cursor: z
      .string()
      .regex(/^[0-9]+$/u)
      .optional(),
  })
  .strict();
const DeleteTraceQuerySchema = z.object({ confirm: UuidSchema }).strict();

function problem(
  reply: FastifyReply,
  request: FastifyRequest,
  status: number,
  code: string,
  detail: string,
) {
  return reply.status(status).send({
    type: `https://intenttrace.local/problems/${code}`,
    title:
      status === 404
        ? "Resource not found"
        : status === 409
          ? "Integrity conflict"
          : "Request failed",
    status,
    detail,
    instance: request.url,
    code,
    requestId: request.id,
  });
}

async function persistPayload(
  services: ApiServices,
  input: z.infer<typeof RawTraceEventInputSchema>,
): Promise<z.infer<typeof RawTraceEventInputSchema>> {
  if (input.payload === undefined) return input;
  await services.repository.ensureTrace(input);
  const bytes = new TextEncoder().encode(JSON.stringify(input.payload));
  const metadata = await services.artifactStore.put({
    traceId: input.traceId,
    bytes,
    mediaType: "application/json",
  });
  const artifact = await services.repository.registerArtifact({
    traceId: input.traceId,
    sha256: metadata.sha256,
    byteLength: metadata.byteLength,
    mediaType: metadata.mediaType,
    storageKey: metadata.sha256,
  });
  const event = { ...input };
  delete event.payload;
  return RawTraceEventInputSchema.parse({
    ...event,
    payloadRef: {
      artifactId: artifact.id,
      sha256: artifact.sha256,
      byteLength: artifact.byteLength,
    },
    artifactRefs: [...new Set([...event.artifactRefs, artifact.id])],
  });
}

function formatSse(event: {
  id: string;
  traceId: string;
  revisionId: string | null;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify({
    schemaVersion: "1.0.0",
    eventId: event.id,
    traceId: event.traceId,
    occurredAt: event.occurredAt,
    revisionId: event.revisionId,
    type: event.type,
    payload: event.payload,
  })}\n\n`;
}

export async function registerTraceRoutes(
  app: FastifyInstance,
  services: ApiServices,
): Promise<void> {
  app.post(
    "/api/v1/events",
    {
      schema: {
        operationId: "ingestRawEvent",
        summary: "Append one normalized raw trace fact",
        body: RawTraceEventInputSchema,
        response: { 200: IngestResultSchema, 201: IngestResultSchema },
      },
    },
    async (request, reply) => {
      try {
        const input = await persistPayload(services, RawTraceEventInputSchema.parse(request.body));
        const result = await services.repository.ingest(input);
        return reply.status(result.duplicate ? 200 : 201).send(result);
      } catch (error) {
        if (error instanceof IntegrityConflictError) {
          return problem(
            reply,
            request,
            409,
            error.code,
            `${error.message}; existing=${error.existingEventId}`,
          );
        }
        throw error;
      }
    },
  );

  app.post(
    "/v1/traces",
    {
      schema: {
        operationId: "exportOtlpTraces",
        summary: "OTLP/HTTP JSON trace receiver",
        body: z.record(z.string(), z.unknown()),
        response: { 200: OtlpPartialSuccessSchema },
      },
    },
    async (request, reply) => {
      const adapter = new OtlpHttpJsonAdapter();
      let rejectedSpans = 0;
      const errors: string[] = [];
      const bytes = new TextEncoder().encode(JSON.stringify(request.body));
      for await (const record of adapter.parse({ bytes, sourceIdentity: "otlp-http" })) {
        if (record.type === "warning") {
          errors.push(record.message);
          continue;
        }
        if (record.type !== "event") continue;
        try {
          await services.repository.ingest(await persistPayload(services, record.event));
        } catch (error) {
          rejectedSpans += 1;
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      return reply.status(200).send({
        partialSuccess: {
          rejectedSpans,
          errorMessage: errors.join("; ").slice(0, 1000),
        },
      });
    },
  );

  app.get(
    "/api/v1/traces",
    {
      schema: {
        operationId: "listTraces",
        summary: "List local traces",
        querystring: TraceListQuerySchema,
        response: { 200: TraceListSchema },
      },
    },
    async (request) => {
      const query = TraceListQuerySchema.parse(request.query);
      return services.repository.listTraces(query.limit);
    },
  );

  app.patch(
    "/api/v1/traces/:traceId/nodes/:nodeId",
    {
      schema: {
        operationId: "editSemanticNode",
        summary: "Create a human semantic revision and optionally pin a node",
        params: NodeParamsSchema,
        body: HumanNodeEditSchema,
        response: { 200: SemanticGraphSnapshotSchema },
      },
    },
    async (request, reply) => {
      const { traceId, nodeId } = NodeParamsSchema.parse(request.params);
      try {
        const revisionId = await services.repository.editSemanticNode(
          traceId,
          nodeId,
          HumanNodeEditSchema.parse(request.body),
        );
        return await services.repository.getGraph(traceId, revisionId);
      } catch (error) {
        if (error instanceof RepositoryNotFoundError) {
          return problem(reply, request, 404, error.code, error.message);
        }
        if (error instanceof StaleSummaryJobError) {
          return problem(reply, request, 409, error.code, error.message);
        }
        throw error;
      }
    },
  );

  app.delete(
    "/api/v1/traces/:traceId",
    {
      schema: {
        operationId: "deleteTrace",
        summary: "Permanently delete one local trace after explicit ID confirmation",
        params: TraceParamsSchema,
        querystring: DeleteTraceQuerySchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { traceId } = TraceParamsSchema.parse(request.params);
      const { confirm } = DeleteTraceQuerySchema.parse(request.query);
      if (confirm !== traceId) {
        return problem(reply, request, 409, "confirmation_mismatch", "confirm must equal traceId");
      }
      try {
        await services.repository.deleteTraceData(traceId);
        await services.artifactStore.deleteTrace(traceId);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof RepositoryNotFoundError) {
          return problem(reply, request, 404, error.code, error.message);
        }
        throw error;
      }
    },
  );

  app.get(
    "/api/v1/traces/:traceId",
    {
      schema: {
        operationId: "getTrace",
        summary: "Get trace metadata",
        params: TraceParamsSchema,
        response: { 200: TraceSummarySchema },
      },
    },
    async (request, reply) => {
      try {
        return await services.repository.getTrace(TraceParamsSchema.parse(request.params).traceId);
      } catch (error) {
        if (error instanceof RepositoryNotFoundError) {
          return problem(reply, request, 404, error.code, error.message);
        }
        throw error;
      }
    },
  );

  app.get(
    "/api/v1/traces/:traceId/events",
    {
      schema: {
        operationId: "listRawEvents",
        summary: "Page append-only raw events by ingest sequence",
        params: TraceParamsSchema,
        querystring: EventQuerySchema,
        response: { 200: RawEventPageSchema },
      },
    },
    async (request) => {
      const { traceId } = TraceParamsSchema.parse(request.params);
      const query = EventQuerySchema.parse(request.query);
      return services.repository.listRawEvents(traceId, query.after, query.limit);
    },
  );

  app.get(
    "/api/v1/traces/:traceId/snapshot",
    {
      schema: {
        operationId: "getTraceSnapshot",
        summary: "Get raw trace snapshot at the current watermark",
        params: TraceParamsSchema,
        querystring: EventQuerySchema,
        response: { 200: TraceSnapshotSchema },
      },
    },
    async (request) => {
      const { traceId } = TraceParamsSchema.parse(request.params);
      const query = EventQuerySchema.parse(request.query);
      const [trace, raw, agents, graph] = await Promise.all([
        services.repository.getTrace(traceId),
        services.repository.listRawEvents(traceId, query.after, query.limit),
        services.repository.getAgentTimeline(traceId),
        services.repository.getGraph(traceId),
      ]);
      return { trace, raw, agents, revision: graph?.revision ?? null };
    },
  );

  app.get(
    "/api/v1/traces/:traceId/graph",
    {
      schema: {
        operationId: "getSemanticGraph",
        summary: "Get one committed semantic graph revision",
        params: TraceParamsSchema,
        querystring: GraphQuerySchema,
        response: { 200: SemanticGraphSnapshotSchema },
      },
    },
    async (request, reply) => {
      const { traceId } = TraceParamsSchema.parse(request.params);
      const query = GraphQuerySchema.parse(request.query);
      const graph = await services.repository.getGraph(traceId, query.revisionId);
      if (!graph) {
        return problem(reply, request, 404, "not_found", "semantic graph revision was not found");
      }
      return graph;
    },
  );

  app.get(
    "/api/v1/traces/:traceId/provider-calls",
    {
      schema: {
        operationId: "listProviderCalls",
        summary: "Audit summary provider calls and recorded cost fields",
        params: TraceParamsSchema,
        response: { 200: ProviderCallAuditListSchema },
      },
    },
    async (request) => ({
      calls: await services.repository.listProviderCalls(
        TraceParamsSchema.parse(request.params).traceId,
      ),
    }),
  );

  app.get(
    "/api/v1/traces/:traceId/artifacts/:artifactId",
    {
      schema: {
        operationId: "getArtifactRange",
        summary: "Read an evidence artifact byte range",
        params: ArtifactParamsSchema,
        querystring: ArtifactQuerySchema,
      },
    },
    async (request, reply) => {
      try {
        const { traceId, artifactId } = ArtifactParamsSchema.parse(request.params);
        const query = ArtifactQuerySchema.parse(request.query);
        const artifact = await services.repository.getArtifact(traceId, artifactId);
        const bytes = await services.artifactStore.getRange(
          traceId,
          artifact.sha256,
          query.offset,
          query.length,
        );
        return reply
          .header(
            "content-type",
            artifact.mediaType === "text/html" || artifact.mediaType === "image/svg+xml"
              ? "application/octet-stream"
              : artifact.mediaType,
          )
          .header("content-disposition", `attachment; filename="artifact-${artifactId}"`)
          .header("content-security-policy", "default-src 'none'; sandbox")
          .header("accept-ranges", "bytes")
          .header("x-content-type-options", "nosniff")
          .send(Buffer.from(bytes));
      } catch (error) {
        if (error instanceof RepositoryNotFoundError) {
          return problem(reply, request, 404, error.code, error.message);
        }
        throw error;
      }
    },
  );

  app.get(
    "/api/v1/traces/:traceId/stream",
    {
      schema: {
        operationId: "streamTraceEvents",
        summary: "Resume durable trace events with Last-Event-ID or cursor",
        params: TraceParamsSchema,
        querystring: StreamQuerySchema,
      },
    },
    async (request, reply) => {
      const { traceId } = TraceParamsSchema.parse(request.params);
      const query = StreamQuerySchema.parse(request.query);
      const header = request.headers["last-event-id"];
      let cursor = BigInt(query.cursor ?? (typeof header === "string" ? header : "0"));
      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      const bounds = await services.repository.getStreamBounds(traceId);
      if (cursor > 0n && bounds.earliest !== null && cursor < bounds.earliest - 1n) {
        reply.raw.write(
          `id: ${bounds.earliest - 1n}\nevent: resync.required\ndata: ${JSON.stringify({
            schemaVersion: "1.0.0",
            traceId,
            type: "resync.required",
            payload: { requestedCursor: String(cursor), earliestCursor: String(bounds.earliest) },
          })}\n\n`,
        );
        cursor = bounds.earliest - 1n;
      }
      let heartbeatAt = Date.now();
      while (!request.raw.destroyed) {
        const events = await services.repository.listStreamEvents(traceId, cursor);
        for (const event of events) {
          reply.raw.write(formatSse(event));
          cursor = BigInt(event.id);
        }
        if (Date.now() - heartbeatAt >= 15_000) {
          reply.raw.write(`event: heartbeat\ndata: {"cursor":"${cursor}"}\n\n`);
          heartbeatAt = Date.now();
        }
        await delay(500);
      }
    },
  );
}
