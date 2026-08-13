import { createHash } from "node:crypto";
import { basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  buildCompletionMarker,
  classifySessionFailure,
  detectSourceKind,
  OtlpHttpJsonAdapter,
  prepareSessionBytes,
  redactCatalogEntry,
  safeIdentifier,
  uploadSessionKey,
  type PreparedSessionBytes,
} from "@intenttrace/adapters";
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
  SemanticRevisionListSchema,
  SessionImportOutcomeSchema,
  SessionUploadCandidateListSchema,
  SessionUploadCandidateRequestSchema,
  TraceListSchema,
  TraceSnapshotSchema,
  TraceSummarySchema,
  UuidSchema,
  type TraceSourceKind,
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
const RevisionListQuerySchema = z
  .object({ limit: z.coerce.number().int().min(1).max(500).default(100) })
  .strict();
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
const ImportUploadQuerySchema = z
  .object({
    source: z.enum(["auto", "jsonl", "otlp", "codex", "claude"]).default("auto"),
    fileName: z.string().min(1).max(255),
  })
  .strict();

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

export interface TraceRouteOptions {
  services: ApiServices;
  uploadMaxBytes: number;
}

export async function registerTraceRoutes(
  app: FastifyInstance,
  options: TraceRouteOptions,
): Promise<void> {
  const { services, uploadMaxBytes } = options;
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
      for await (const record of adapter.parse({
        parts: [{ path: ".", bytes }],
        sourceIdentity: "otlp-http",
      })) {
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

  app.post(
    "/api/v1/imports/candidates",
    {
      schema: {
        operationId: "inspectImportCandidates",
        summary: "Inspect bounded session heads for source, preview, and import status",
        body: SessionUploadCandidateRequestSchema,
        response: { 200: SessionUploadCandidateListSchema },
      },
    },
    async (request, reply) => {
      const body = SessionUploadCandidateRequestSchema.parse(request.body);
      const candidates = await Promise.all(
        body.candidates.map(async (input) => {
          const base = {
            clientRef: input.clientRef,
            source: null as TraceSourceKind | null,
            title: null as string | null,
            projectHint: null as string | null,
            firstPromptPreview: null as string | null,
            lastPromptPreview: null as string | null,
            partialHead: !input.complete,
            traceId: null as string | null,
            imported: false,
            importedEventCount: null as string | null,
            failureCode: null as string | null,
            failureMessage: null as string | null,
          };
          let bytes = Buffer.from(input.headBase64, "base64");
          if (!input.complete) {
            // Drop the partial trailing record so the head parses as a whole file.
            const cut = bytes.lastIndexOf(0x0a);
            bytes = cut >= 0 ? bytes.subarray(0, cut + 1) : bytes;
          }
          const sourceIdentity = safeIdentifier(basename(input.fileName), "upload");
          const source = await detectSourceKind({
            parts: [{ path: input.fileName, bytes }],
            sourceIdentity,
          });
          if (!source) {
            return {
              ...base,
              failureCode: "unknown_source_format",
              failureMessage: "Unable to determine the session format",
            };
          }
          const headSha256 = createHash("sha256").update(bytes).digest("hex");
          try {
            const prepared = await prepareSessionBytes(source, bytes, sourceIdentity, {
              id: uploadSessionKey(source, headSha256),
              byteLength: input.byteLength,
              modifiedAt: input.modifiedAt,
            });
            const entry = redactCatalogEntry(prepared.descriptor, body.includePreviews);
            return {
              ...base,
              source,
              title: entry.title,
              projectHint: entry.projectHint,
              firstPromptPreview: entry.firstPromptPreview,
              lastPromptPreview: entry.lastPromptPreview,
              traceId: prepared.events[0]!.traceId,
            };
          } catch (error) {
            const failure = classifySessionFailure(error);
            return {
              ...base,
              source,
              failureCode: failure.code,
              failureMessage: failure.message,
            };
          }
        }),
      );
      const traceIds = [
        ...new Set(
          candidates
            .map((candidate) => candidate.traceId)
            .filter((traceId): traceId is string => traceId !== null),
        ),
      ];
      const known = new Map(
        (await services.repository.listTracesByIds(traceIds)).map((trace) => [
          trace.id,
          trace.eventCount,
        ]),
      );
      let alreadyImportedCount = 0;
      const resolved = candidates.map((candidate) => {
        const eventCount = candidate.traceId === null ? undefined : known.get(candidate.traceId);
        if (eventCount === undefined) return candidate;
        alreadyImportedCount += 1;
        return { ...candidate, imported: true, importedEventCount: eventCount };
      });
      return reply.status(200).send({
        protocolVersion: 1,
        candidates: resolved,
        alreadyImportedCount,
      });
    },
  );

  app.post(
    "/api/v1/imports/sessions",
    {
      bodyLimit: uploadMaxBytes,
      schema: {
        operationId: "importUploadedSession",
        // jsonSchemaTransform emits nothing for a raw body, so the media type
        // lives in the summary rather than an unrendered `consumes`.
        summary: "Import one uploaded agent session file (application/octet-stream body)",
        querystring: ImportUploadQuerySchema,
        response: { 200: SessionImportOutcomeSchema },
      },
    },
    async (request, reply) => {
      const bytes = request.body;
      if (!Buffer.isBuffer(bytes)) {
        return problem(
          reply,
          request,
          415,
          "unsupported_media_type",
          "session upload requires application/octet-stream",
        );
      }
      const query = ImportUploadQuerySchema.parse(request.query);
      const sourceIdentity = safeIdentifier(basename(query.fileName), "upload");
      const source =
        query.source === "auto"
          ? await detectSourceKind({
              parts: [{ path: query.fileName, bytes }],
              sourceIdentity,
            })
          : query.source;
      if (!source) {
        return problem(
          reply,
          request,
          422,
          "unknown_source_format",
          "Unable to determine the session format",
        );
      }
      const contentSha256 = createHash("sha256").update(bytes).digest("hex");
      const sessionId = uploadSessionKey(source, contentSha256);

      let prepared: PreparedSessionBytes;
      try {
        // The whole file is parsed before the first insert, so a malformed tail
        // can never leave a partially imported trace.
        prepared = await prepareSessionBytes(source, bytes, sourceIdentity, {
          id: sessionId,
          byteLength: bytes.byteLength,
          modifiedAt: new Date().toISOString(),
        });
      } catch (error) {
        const failure = classifySessionFailure(error);
        if (failure.code === "file_too_large") {
          return problem(reply, request, 413, "payload_too_large", failure.message);
        }
        if (failure.code === "unsupported_version") {
          return problem(reply, request, 422, "unsupported_source_version", failure.message);
        }
        if (failure.code === "no_visible_events") {
          return problem(reply, request, 422, "no_visible_events", failure.message);
        }
        return problem(reply, request, 422, "preflight_failed", failure.message);
      }

      let inserted = 0;
      let duplicates = 0;
      const ingest = async (event: z.infer<typeof RawTraceEventInputSchema>): Promise<void> => {
        const result = await services.repository.ingest(await persistPayload(services, event));
        if (result.duplicate) duplicates += 1;
        else inserted += 1;
      };
      try {
        for (const event of prepared.events) await ingest(event);
        await ingest(buildCompletionMarker(prepared.events.at(-1)!, contentSha256));
      } catch (error) {
        if (error instanceof IntegrityConflictError) {
          return problem(
            reply,
            request,
            409,
            error.code,
            `${error.message}; existing=${error.existingEventId}; inserted=${inserted}; duplicates=${duplicates}`,
          );
        }
        throw error;
      }
      return reply.status(200).send({
        protocolVersion: 1,
        level: "result",
        command: "upload",
        sessionId,
        traceId: prepared.events[0]!.traceId,
        inserted,
        duplicates,
        warnings: prepared.warnings.length,
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
    "/api/v1/traces/:traceId/revisions",
    {
      schema: {
        operationId: "listSemanticRevisions",
        summary: "List committed semantic revisions, newest first",
        params: TraceParamsSchema,
        querystring: RevisionListQuerySchema,
        response: { 200: SemanticRevisionListSchema },
      },
    },
    async (request) => {
      const { traceId } = TraceParamsSchema.parse(request.params);
      const query = RevisionListQuerySchema.parse(request.query);
      return { revisions: await services.repository.listRevisions(traceId, query.limit) };
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
