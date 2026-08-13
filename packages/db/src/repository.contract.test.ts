import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { RawTraceEventInput, SemanticEdgeVersion } from "@intenttrace/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  IntegrityConflictError,
  IntentTraceRepository,
  RepositoryNotFoundError,
} from "./repository.js";

const databaseUrl = process.env.DATABASE_URL;
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");

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
    sql = postgres(databaseUrl!, { max: 1 });
    await migrate(drizzle(sql), { migrationsFolder });
    repository = new IntentTraceRepository(sql);
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
        event(ids, "evt-spawn-parent", { kind: "agent_start", agentId: "parent" }),
      );
      const child = await repository.ingest(
        event(ids, "evt-spawn-child", {
          kind: "agent_start",
          agentId: "child",
          attributes: { parentAgentId: "parent" },
        }),
      );
      const jobIds = await repository.listRunnableSummaryJobIds();
      const jobId = jobIds.find(Boolean);
      expect(jobId).toBeDefined();
      const job = await repository.claimSummaryJob(jobId!);
      expect(job).not.toBeNull();

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
            node(sourceNodeId, "Parent dispatch", "parent", parent.event.id),
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

      // Pre-upgrade rows kept their immutable shape but lost their evidence, so
      // the read path must omit them rather than invent provenance.
      await sql`
        update semantic_edge_versions
        set evidence_event_ids = null, provenance = null
        where trace_id = ${ids.traceId}
      `;
      const downgraded = await repository.getGraph(ids.traceId, revisionId);
      expect(downgraded?.edges).toEqual([]);
      const downgradedTopology = await repository.getObservedTopology(ids.traceId, revisionId);
      expect(downgradedTopology.observed.spawnEdges).toBe(0);
    } finally {
      await discard(ids.traceId);
    }
  });
});
