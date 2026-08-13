import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  RawTraceEventInput,
  SemanticEdgeVersion,
  TopologyCapability,
} from "@intenttrace/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  IntegrityConflictError,
  IntentTraceRepository,
  RepositoryNotFoundError,
  StaleSummaryJobError,
} from "./repository.js";

const databaseUrl = process.env.DATABASE_URL;
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");

const passthroughTopology: TopologyCapability = {
  spawn: "passthrough",
  join: "passthrough",
  peerMessages: "passthrough",
  input: "single-file",
  laneKey: "agentId",
  limits: [],
};

/**
 * These cases exercise real committed migrations, so they only run when an
 * operator supplied `DATABASE_URL`. They never truncate shared tables: each
 * case owns freshly generated workspace/project/trace IDs and deletes that one
 * trace in `finally`.
 */
describe.skipIf(!databaseUrl)("repository persistence contract", () => {
  let sql: postgres.Sql;
  let repository: IntentTraceRepository;

  beforeAll(async () => {
    // Drizzle's postgres-js driver replaces the json/jsonb serializers on the
    // client it wraps, so migrations run on their own short-lived connection.
    const migrationSql = postgres(databaseUrl!, { max: 1 });
    try {
      await migrate(drizzle(migrationSql), { migrationsFolder });
    } finally {
      await migrationSql.end();
    }
    sql = postgres(databaseUrl!, { max: 1 });
    repository = new IntentTraceRepository(sql, {
      lookupTopologyCapability: () => passthroughTopology,
    });
  });

  afterAll(async () => {
    await sql?.end();
  });

  interface TraceScope {
    workspaceId: string;
    projectId: string;
    traceId: string;
    sourceInstanceId: string;
  }

  function scope(): TraceScope {
    return {
      workspaceId: randomUUID(),
      projectId: randomUUID(),
      traceId: randomUUID(),
      sourceInstanceId: `contract-${randomUUID()}`,
    };
  }

  function event(
    ids: TraceScope,
    sourceEventId: string,
    overrides: Partial<RawTraceEventInput> = {},
  ): RawTraceEventInput {
    return {
      schemaVersion: "1.0.0",
      workspaceId: ids.workspaceId,
      projectId: ids.projectId,
      traceId: ids.traceId,
      source: {
        kind: "jsonl",
        formatVersion: "1.0.0",
        adapterVersion: "1.0.0",
        sourceInstanceId: ids.sourceInstanceId,
        sourceEventId,
      },
      occurredAt: "2026-08-03T00:00:00.000Z",
      kind: "user_message",
      name: "contract event",
      status: "ok",
      artifactRefs: [],
      attributes: {},
      ...overrides,
    };
  }

  it("enumerates every trace ID without the UI list cap", async () => {
    const ids = Array.from({ length: 201 }, () => scope());
    try {
      for (const item of ids) await repository.ensureTrace(event(item, "evt-seed"));
      const all = new Set(await repository.listAllTraceIds());
      expect(ids.every((item) => all.has(item.traceId))).toBe(true);
    } finally {
      for (const item of ids) await discard(item.traceId);
    }
  });

  /** Cleanup must never mask the failure that stopped a case mid-way. */
  async function discard(traceId: string): Promise<void> {
    try {
      await repository.deleteTraceData(traceId);
    } catch (error) {
      if (!(error instanceof RepositoryNotFoundError)) throw error;
    }
  }

  it("resolves a producer causation reference inside the ingest transaction", async () => {
    const ids = scope();
    try {
      const parent = await repository.ingest(event(ids, "evt-parent"));
      const child = await repository.ingest(
        event(ids, "evt-child", { causationSourceEventId: "evt-parent" }),
      );

      expect(child.warnings).toEqual([]);
      expect(child.event.causationEventId).toBe(parent.event.id);
      expect(child.event).not.toHaveProperty("causationSourceEventId");
    } finally {
      await discard(ids.traceId);
    }
  });

  it("records an unresolved causation reference as a durable warning and keeps the event", async () => {
    const ids = scope();
    try {
      const inserted = await repository.ingest(
        event(ids, "evt-orphan", { causationSourceEventId: "evt-missing" }),
      );

      expect(inserted.duplicate).toBe(false);
      expect(inserted.event.causationEventId).toBeUndefined();
      expect(inserted.warnings).toEqual([
        { code: "causation_source_event_unresolved", sourceEventId: "evt-missing" },
      ]);
      expect(inserted.event.attributes.intenttraceWarnings).toEqual([
        { code: "causation_source_event_unresolved", sourceEventId: "evt-missing" },
      ]);

      // The referenced event now exists, but a duplicate delivery must replay the
      // stored diagnostic instead of re-resolving causation.
      await repository.ingest(event(ids, "evt-missing"));
      const duplicate = await repository.ingest(
        event(ids, "evt-orphan", { causationSourceEventId: "evt-missing" }),
      );

      expect(duplicate.duplicate).toBe(true);
      expect(duplicate.event.causationEventId).toBeUndefined();
      expect(duplicate.warnings).toEqual([
        { code: "causation_source_event_unresolved", sourceEventId: "evt-missing" },
      ]);
    } finally {
      await discard(ids.traceId);
    }
  });

  it("treats a changed causal assertion on one source identity as an integrity conflict", async () => {
    const ids = scope();
    try {
      await repository.ingest(event(ids, "evt-root"));
      await repository.ingest(event(ids, "evt-claim"));

      await expect(
        repository.ingest(event(ids, "evt-claim", { causationSourceEventId: "evt-root" })),
      ).rejects.toBeInstanceOf(IntegrityConflictError);
    } finally {
      await discard(ids.traceId);
    }
  });

  it("commits, reads back, and later omits unaudited semantic edge evidence", async () => {
    const ids = scope();
    try {
      const parent = await repository.ingest(
        event(ids, "evt-spawn-parent", {
          kind: "agent_handoff",
          agentId: "parent",
          attributes: { spawnedAgentIds: ["child"] },
        }),
      );
      const child = await repository.ingest(
        event(ids, "evt-spawn-child", {
          kind: "agent_start",
          agentId: "child",
          attributes: { parentAgentId: "parent" },
        }),
      );
      for (let index = 3; index <= 50; index += 1) {
        await repository.ingest(event(ids, `evt-fill-${index}`));
      }
      const jobRows = await sql<Array<{ id: string }>>`
        select id from summary_jobs
        where trace_id = ${ids.traceId} and event_watermark = 50
        order by created_at, id
        limit 1
      `;
      const jobId = jobRows[0]?.id;
      expect(jobId).toBeDefined();
      const job = await repository.claimSummaryJob(jobId!);
      expect(job).not.toBeNull();
      expect(job!.reducerFacts.map((fact) => fact.sourceEventId)).toContain("evt-spawn-parent");
      expect(job!.allowedEventIds).not.toContain(parent.event.id);

      const sourceNodeId = randomUUID();
      const targetNodeId = randomUUID();
      const logicalEdgeId = randomUUID();
      const node = (logicalNodeId: string, title: string, agentId: string, eventId: string) => ({
        logicalNodeId,
        versionId: randomUUID(),
        kind: "work" as const,
        status: "active" as const,
        title,
        claims: [
          {
            kind: "action" as const,
            text: `${title} recorded`,
            provenance: "stated" as const,
            confidence: "high" as const,
            evidenceEventIds: [eventId],
          },
        ],
        primaryParentId: null,
        primaryAgentId: agentId,
        participantAgentIds: [agentId],
        artifactIds: [],
        pinnedByHuman: false,
        startedAt: null,
        endedAt: null,
        layout: null,
      });

      const revisionId = await repository.commitSummaryJob(job!.id, {
        state: {
          nodes: [
            {
              ...node(sourceNodeId, "Parent dispatch", "parent", parent.event.id),
              pinnedByHuman: true,
              layout: { x: 12, y: 34 },
            },
            node(targetNodeId, "Child work", "child", child.event.id),
          ],
          edges: [
            {
              logicalEdgeId,
              versionId: randomUUID(),
              sourceNodeId,
              targetNodeId,
              kind: "decomposes_to",
              retired: false,
              evidenceEventIds: [parent.event.id, child.event.id].sort(),
              provenance: "stated",
            },
          ],
        },
        changedNodeIds: [sourceNodeId, targetNodeId],
        changedEdgeIds: [logicalEdgeId],
        provider: "contract-test",
        model: "contract-test",
        requestHash: "a".repeat(64),
        responseHash: "b".repeat(64),
        diagnostics: [],
        egress: "none",
      });

      const graph = await repository.getGraph(ids.traceId, revisionId);
      const edge = graph?.edges[0] as SemanticEdgeVersion | undefined;
      expect(edge?.evidenceEventIds).toEqual([parent.event.id, child.event.id].sort());
      expect(edge?.provenance).toBe("stated");

      const topology = await repository.getObservedTopology(ids.traceId, revisionId);
      expect(topology.observed).toEqual({
        lanes: 2,
        lanesWithParent: 1,
        spawnEdges: 1,
        peerEdges: 0,
      });
      expect(topology.sources).toEqual([{ sourceKind: "jsonl", adapterVersion: "1.0.0" }]);

      // Pre-upgrade rows kept their immutable shape but lack evidence. Insert
      // one directly rather than violating the immutable-table trigger.
      const legacyLogicalEdgeId = randomUUID();
      const legacyVersionId = randomUUID();
      await sql`
        insert into semantic_edge_versions (
          id, logical_edge_id, trace_id, source_node_id, target_node_id, kind, retired,
          evidence_event_ids, provenance
        ) values (
          ${legacyVersionId}, ${legacyLogicalEdgeId}, ${ids.traceId}, ${sourceNodeId},
          ${targetNodeId}, 'decomposes_to', false, null, null
        )
      `;
      await sql`
        insert into revision_edge_members (revision_id, logical_edge_id, edge_version_id)
        values (${revisionId}, ${legacyLogicalEdgeId}, ${legacyVersionId})
      `;
      const withLegacy = await repository.getGraph(ids.traceId, revisionId);
      expect(withLegacy?.edges).toHaveLength(1);
      expect(withLegacy?.edges[0]?.logicalEdgeId).toBe(logicalEdgeId);
      const withLegacyTopology = await repository.getObservedTopology(ids.traceId, revisionId);
      expect(withLegacyTopology.observed.spawnEdges).toBe(1);

      const providerCallsBefore = await repository.listProviderCalls(ids.traceId);
      const revisionCountBefore = (await repository.listRevisions(ids.traceId, 100)).length;
      await sql`update traces set status = 'completed' where id = ${ids.traceId}`;

      const concurrentSql = postgres(databaseUrl!, { max: 1 });
      const concurrentRepository = new IntentTraceRepository(concurrentSql, {
        lookupTopologyCapability: () => passthroughTopology,
      });
      const attempts = await Promise.allSettled([
        repository.rederiveTopology(ids.traceId, revisionId),
        concurrentRepository.rederiveTopology(ids.traceId, revisionId),
      ]);
      await concurrentSql.end();
      const fulfilled = attempts.filter(
        (attempt): attempt is PromiseFulfilledResult<string | null> =>
          attempt.status === "fulfilled",
      );
      const rejected = attempts.filter(
        (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected",
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(StaleSummaryJobError);
      const rebuiltRevisionId = fulfilled[0]!.value;
      expect(rebuiltRevisionId).toMatch(/^[0-9a-f-]{36}$/u);
      const rebuilt = await repository.getGraph(ids.traceId, rebuiltRevisionId!);
      expect(rebuilt?.revision).toMatchObject({
        id: rebuiltRevisionId,
        parentRevisionId: revisionId,
        branchKind: "final",
        eventWatermark: graph?.revision.eventWatermark,
        sourceJobId: null,
      });
      expect(rebuilt?.edges.filter((edge) => !edge.retired)).toMatchObject([
        {
          kind: "decomposes_to",
          sourceNodeId,
          targetNodeId,
          evidenceEventIds: [parent.event.id, child.event.id].sort(),
          provenance: "stated",
        },
      ]);
      expect(rebuilt?.nodes.find((node) => node.logicalNodeId === sourceNodeId)).toMatchObject({
        id: graph?.nodes.find((node) => node.logicalNodeId === sourceNodeId)?.id,
        primaryParentId: null,
        pinnedByHuman: true,
        layout: { x: 12, y: 34 },
      });
      expect(await repository.listProviderCalls(ids.traceId)).toEqual(providerCallsBefore);
      expect(await repository.listRevisions(ids.traceId, 100)).toHaveLength(
        revisionCountBefore + 1,
      );
      const rebuildEvents = await sql<Array<{ payload: Record<string, unknown> }>>`
        select payload from stream_events
        where trace_id = ${ids.traceId} and revision_id = ${rebuiltRevisionId}
          and type = 'semantic_revision.created'
      `;
      expect(rebuildEvents[0]?.payload).toMatchObject({
        revisionId: rebuiltRevisionId,
        provider: "deterministic-topology-rebuild",
      });

      expect(await repository.rederiveTopology(ids.traceId, rebuiltRevisionId!)).toBeNull();
      expect(await repository.listRevisions(ids.traceId, 100)).toHaveLength(
        revisionCountBefore + 1,
      );
    } finally {
      await discard(ids.traceId);
    }
  });

  it("rejects new semantic edge versions without valid audit evidence", async () => {
    const ids = scope();
    try {
      const inserted = await repository.ingest(event(ids, "evt-invalid-edge"));
      const jobRows = await sql<Array<{ id: string }>>`
        select id from summary_jobs where trace_id = ${ids.traceId} order by created_at, id limit 1
      `;
      const job = await repository.claimSummaryJob(jobRows[0]!.id);
      const sourceNodeId = randomUUID();
      const targetNodeId = randomUUID();
      const versionId = randomUUID();
      const node = (logicalNodeId: string, title: string) => ({
        logicalNodeId,
        versionId: randomUUID(),
        kind: "work" as const,
        status: "active" as const,
        title,
        claims: [{
          kind: "action" as const,
          text: `${title} evidence`,
          provenance: "stated" as const,
          confidence: "high" as const,
          evidenceEventIds: [inserted.event.id],
        }],
        primaryParentId: null,
        primaryAgentId: null,
        participantAgentIds: [],
        artifactIds: [],
        pinnedByHuman: false,
        startedAt: null,
        endedAt: null,
        layout: null,
      });
      const commit = (evidenceEventIds: string[], provenance: string) =>
        repository.commitSummaryJob(job!.id, {
          state: {
            nodes: [node(sourceNodeId, "Source work"), node(targetNodeId, "Target work")],
            edges: [{
              logicalEdgeId: randomUUID(),
              versionId,
              sourceNodeId,
              targetNodeId,
              kind: "depends_on",
              retired: false,
              evidenceEventIds,
              provenance,
            }],
          } as Parameters<IntentTraceRepository["commitSummaryJob"]>[1]["state"],
          changedNodeIds: [sourceNodeId, targetNodeId],
          changedEdgeIds: [],
          provider: "contract-test",
          model: "contract-test",
          requestHash: "a".repeat(64),
          responseHash: "b".repeat(64),
          diagnostics: [],
          egress: "none",
        });

      await expect(commit([], "stated")).rejects.toThrow("semantic edge audit metadata");
      await expect(commit(["not-a-uuid"], "stated")).rejects.toThrow(
        "semantic edge audit metadata",
      );
      await expect(commit([inserted.event.id], "fabricated")).rejects.toThrow(
        "semantic edge audit metadata",
      );
      const rows = await sql<Array<{ count: number }>>`
        select count(*)::int as count from semantic_edge_versions where trace_id = ${ids.traceId}
      `;
      expect(rows[0]?.count).toBe(0);
    } finally {
      await discard(ids.traceId);
    }
  });
});
