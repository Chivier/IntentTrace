import { describe, expect, it } from "vitest";

import { SchemaVersion } from "@intenttrace/schema";

import { applyProviderPatch, type ReducerGraphState } from "../src/index.js";

const eventId = "019fbbb3-4324-7d43-8f9c-cd489a92cb28";
const revisionId = "019fbbb3-4324-7d43-8f9c-cd489a92cb29";
const nonce = "019fbbb3-4324-7d43-8f9c-cd489a92cb30";
const nodeA = "019fbbb3-4324-7d43-8f9c-cd489a92cb31";
const nodeB = "019fbbb3-4324-7d43-8f9c-cd489a92cb32";
const edgeA = "019fbbb3-4324-7d43-8f9c-cd489a92cb33";
const versionA = "019fbbb3-4324-7d43-8f9c-cd489a92cb34";
const versionB = "019fbbb3-4324-7d43-8f9c-cd489a92cb35";
const edgeVersion = "019fbbb3-4324-7d43-8f9c-cd489a92cb36";
const baseNode = (id: string, versionId: string) => ({
  logicalNodeId: id,
  versionId,
  kind: "work" as const,
  status: "active" as const,
  title: "Existing work",
  claims: [
    {
      kind: "action" as const,
      text: "Observed work",
      provenance: "stated" as const,
      confidence: "high" as const,
      evidenceEventIds: [eventId],
    },
  ],
  primaryParentId: null,
  primaryAgentId: null,
  participantAgentIds: [],
  artifactIds: [],
  pinnedByHuman: false,
  startedAt: null,
  endedAt: null,
  layout: null,
});
const context = (state: ReducerGraphState, pinned = new Set<string>()) => ({
  expectedBaseRevisionId: revisionId,
  expectedJobNonce: nonce,
  allowedEventIds: new Set([eventId]),
  allowedArtifactIds: new Set<string>(),
  allowedAgentIds: new Set<string>(),
  allowedNodeIds: new Set(state.nodes.map((node) => node.logicalNodeId)),
  allowedEdgeIds: new Set(state.edges.map((edge) => edge.logicalEdgeId)),
  pinnedNodeIds: pinned,
});

describe("deterministic reducer properties", () => {
  it("ignores provider confidence and derives claim confidence from evidence", () => {
    const state: ReducerGraphState = { nodes: [], edges: [] };
    const patch = {
      schemaVersion: SchemaVersion,
      jobNonce: nonce,
      baseRevisionId: revisionId,
      operations: [
        {
          op: "add_node",
          ref: "tmp:1",
          node: {
            kind: "request",
            status: "active",
            title: "Evidence backed request",
            claims: [
              {
                kind: "intent",
                text: "Complete the project",
                provenance: "stated",
                suggestedConfidence: "low",
                evidenceEventIds: [eventId],
              },
            ],
            participantAgentIds: [],
            artifactIds: [],
          },
        },
      ],
      diagnostics: [],
    };
    const first = applyProviderPatch(patch, state, context(state));
    const second = applyProviderPatch(patch, state, context(state));
    expect(first).toEqual(second);
    expect(first.ok && first.state.nodes[0]?.claims[0]?.confidence).toBe("high");
  });

  it("rejects hierarchical cycles", () => {
    const state: ReducerGraphState = {
      nodes: [baseNode(nodeA, versionA), baseNode(nodeB, versionB)],
      edges: [
        {
          logicalEdgeId: edgeA,
          versionId: edgeVersion,
          sourceNodeId: nodeA,
          targetNodeId: nodeB,
          kind: "depends_on",
          evidenceEventIds: [eventId],
          provenance: "stated",
          retired: false,
        },
      ],
    };
    const result = applyProviderPatch(
      {
        schemaVersion: SchemaVersion,
        jobNonce: nonce,
        baseRevisionId: revisionId,
        operations: [
          {
            op: "add_edge",
            ref: "tmp-edge:1",
            sourceRef: nodeB,
            targetRef: nodeA,
            kind: "depends_on",
            evidenceEventIds: [eventId],
          },
        ],
        diagnostics: [],
      },
      state,
      context(state),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe("cycle");
  });

  it("gives human pins precedence over provider updates", () => {
    const state: ReducerGraphState = {
      nodes: [{ ...baseNode(nodeA, versionA), pinnedByHuman: true }],
      edges: [],
    };
    const result = applyProviderPatch(
      {
        schemaVersion: SchemaVersion,
        jobNonce: nonce,
        baseRevisionId: revisionId,
        operations: [
          {
            op: "update_node",
            ref: nodeA,
            set: { title: "Provider overwrite" },
            clear: [],
            evidenceEventIds: [eventId],
          },
        ],
        diagnostics: [],
      },
      state,
      context(state, new Set([nodeA])),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.code === "pinned_node")).toBe(true);
  });
});
