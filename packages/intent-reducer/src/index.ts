import { createHash } from "node:crypto";

import {
  ProviderIntentGraphPatchSchema,
  type CanonicalClaim,
  type ProviderClaim,
  type ProviderIntentGraphPatch,
  type SemanticEdgeKind,
  type SemanticNodeKind,
  type SemanticNodeStatus,
} from "@intenttrace/schema";

export interface PatchValidationContext {
  expectedBaseRevisionId: string;
  expectedJobNonce: string;
  allowedEventIds: ReadonlySet<string>;
  allowedArtifactIds: ReadonlySet<string>;
  allowedAgentIds: ReadonlySet<string>;
  allowedNodeIds: ReadonlySet<string>;
  allowedEdgeIds: ReadonlySet<string>;
  pinnedNodeIds: ReadonlySet<string>;
}

export interface PatchValidationIssue {
  code:
    | "schema_invalid"
    | "stale_revision"
    | "nonce_mismatch"
    | "unknown_reference"
    | "unknown_evidence"
    | "unknown_artifact"
    | "unknown_agent"
    | "duplicate_temporary_ref"
    | "duplicate_edge"
    | "cycle"
    | "self_edge"
    | "pinned_node";
  operationIndex?: number;
  detail: string;
}

export interface ReducerNode {
  logicalNodeId: string;
  versionId: string;
  kind: SemanticNodeKind;
  status: SemanticNodeStatus;
  title: string;
  claims: CanonicalClaim[];
  primaryParentId: string | null;
  primaryAgentId: string | null;
  participantAgentIds: string[];
  artifactIds: string[];
  pinnedByHuman: boolean;
  startedAt: string | null;
  endedAt: string | null;
  layout: { x: number; y: number } | null;
}

export interface ReducerEdge {
  logicalEdgeId: string;
  versionId: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: SemanticEdgeKind;
  retired: boolean;
}

export interface ReducerGraphState {
  nodes: ReducerNode[];
  edges: ReducerEdge[];
}

export type PatchApplyResult =
  | { ok: false; issues: PatchValidationIssue[] }
  | {
      ok: true;
      patch: ProviderIntentGraphPatch;
      state: ReducerGraphState;
      changedNodeIds: string[];
      changedEdgeIds: string[];
      diagnostics: string[];
    };

function deterministicUuid(namespace: string, value: string): string {
  const bytes = createHash("sha256")
    .update(namespace)
    .update("\0")
    .update(value)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function confidence(claim: ProviderClaim): CanonicalClaim["confidence"] {
  const evidenceCount = new Set(claim.evidenceEventIds).size;
  if (claim.provenance === "stated" && evidenceCount >= 1) return "high";
  if (claim.provenance === "mixed" && evidenceCount >= 2) return "high";
  if (evidenceCount >= 1 && claim.provenance !== "inferred") return "medium";
  return "low";
}

function canonicalClaim(claim: ProviderClaim): CanonicalClaim {
  return {
    kind: claim.kind,
    text: claim.text,
    provenance: claim.provenance,
    confidence: confidence(claim),
    evidenceEventIds: [...new Set(claim.evidenceEventIds)],
  };
}

function updateArray<T>(current: T[], update: { operation: string; values: T[] }): T[] {
  if (update.operation === "replace") return [...new Set(update.values)];
  if (update.operation === "append_unique") return [...new Set([...current, ...update.values])];
  const removed = new Set(update.values);
  return current.filter((value) => !removed.has(value));
}

function hierarchicalCycle(edges: readonly ReducerEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.retired || (edge.kind !== "decomposes_to" && edge.kind !== "depends_on")) continue;
    adjacency.set(edge.sourceNodeId, [
      ...(adjacency.get(edge.sourceNodeId) ?? []),
      edge.targetNodeId,
    ]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const child of adjacency.get(node) ?? []) if (visit(child)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...adjacency.keys()].some(visit);
}

export type PatchValidationResult =
  { ok: true; patch: ProviderIntentGraphPatch } | { ok: false; issues: PatchValidationIssue[] };

function collectEvidence(
  operation: ProviderIntentGraphPatch["operations"][number],
): readonly string[] {
  if (operation.op === "add_node")
    return operation.node.claims.flatMap((claim) => claim.evidenceEventIds);
  if (operation.op === "update_node") {
    return [
      ...operation.evidenceEventIds,
      ...(operation.set.claims?.values.flatMap((claim) => claim.evidenceEventIds) ?? []),
    ];
  }
  return operation.evidenceEventIds;
}

export function validateProviderPatch(
  input: unknown,
  context: PatchValidationContext,
): PatchValidationResult {
  const parsed = ProviderIntentGraphPatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: [
        {
          code: "schema_invalid",
          detail: parsed.error.issues.map((issue) => issue.message).join("; "),
        },
      ],
    };
  }

  const patch = parsed.data;
  const issues: PatchValidationIssue[] = [];
  if (patch.baseRevisionId !== context.expectedBaseRevisionId) {
    issues.push({
      code: "stale_revision",
      detail: "patch base revision does not match current revision",
    });
  }
  if (patch.jobNonce !== context.expectedJobNonce) {
    issues.push({ code: "nonce_mismatch", detail: "patch nonce does not match summary job" });
  }

  const temporaryNodes = new Set<string>();
  for (const [index, operation] of patch.operations.entries()) {
    if (operation.op === "add_node") {
      if (temporaryNodes.has(operation.ref)) {
        issues.push({
          code: "duplicate_temporary_ref",
          operationIndex: index,
          detail: operation.ref,
        });
      }
      temporaryNodes.add(operation.ref);
    }
  }

  const knownNodeRef = (ref: string): boolean =>
    temporaryNodes.has(ref) || context.allowedNodeIds.has(ref);

  for (const [index, operation] of patch.operations.entries()) {
    for (const eventId of collectEvidence(operation)) {
      if (!context.allowedEventIds.has(eventId)) {
        issues.push({ code: "unknown_evidence", operationIndex: index, detail: eventId });
      }
    }

    if (operation.op === "add_node") {
      if (operation.node.primaryParentRef && !knownNodeRef(operation.node.primaryParentRef)) {
        issues.push({
          code: "unknown_reference",
          operationIndex: index,
          detail: operation.node.primaryParentRef,
        });
      }
      for (const artifactId of operation.node.artifactIds) {
        if (!context.allowedArtifactIds.has(artifactId)) {
          issues.push({ code: "unknown_artifact", operationIndex: index, detail: artifactId });
        }
      }
      for (const agentId of [
        operation.node.primaryAgentId,
        ...operation.node.participantAgentIds,
      ]) {
        if (agentId && !context.allowedAgentIds.has(agentId)) {
          issues.push({ code: "unknown_agent", operationIndex: index, detail: agentId });
        }
      }
    }

    if (operation.op === "update_node") {
      if (!context.allowedNodeIds.has(operation.ref)) {
        issues.push({ code: "unknown_reference", operationIndex: index, detail: operation.ref });
      }
      if (context.pinnedNodeIds.has(operation.ref)) {
        issues.push({ code: "pinned_node", operationIndex: index, detail: operation.ref });
      }
      if (operation.set.primaryParentRef && !knownNodeRef(operation.set.primaryParentRef)) {
        issues.push({
          code: "unknown_reference",
          operationIndex: index,
          detail: operation.set.primaryParentRef,
        });
      }
      for (const artifactId of operation.set.artifactIds?.values ?? []) {
        if (!context.allowedArtifactIds.has(artifactId)) {
          issues.push({ code: "unknown_artifact", operationIndex: index, detail: artifactId });
        }
      }
      for (const agentId of [
        operation.set.primaryAgentId,
        ...(operation.set.participantAgentIds?.values ?? []),
      ]) {
        if (agentId && !context.allowedAgentIds.has(agentId)) {
          issues.push({ code: "unknown_agent", operationIndex: index, detail: agentId });
        }
      }
    }

    if (operation.op === "add_edge") {
      if (!knownNodeRef(operation.sourceRef) || !knownNodeRef(operation.targetRef)) {
        issues.push({
          code: "unknown_reference",
          operationIndex: index,
          detail: `${operation.sourceRef}->${operation.targetRef}`,
        });
      }
      if (operation.sourceRef === operation.targetRef) {
        issues.push({ code: "self_edge", operationIndex: index, detail: operation.sourceRef });
      }
    }

    if (operation.op === "supersede_node") {
      if (!context.allowedNodeIds.has(operation.fromNodeId) || !knownNodeRef(operation.toRef)) {
        issues.push({
          code: "unknown_reference",
          operationIndex: index,
          detail: operation.fromNodeId,
        });
      }
      if (context.pinnedNodeIds.has(operation.fromNodeId)) {
        issues.push({ code: "pinned_node", operationIndex: index, detail: operation.fromNodeId });
      }
    }

    if (operation.op === "retire_edge" && !context.allowedEdgeIds.has(operation.edgeId)) {
      issues.push({ code: "unknown_reference", operationIndex: index, detail: operation.edgeId });
    }

    if (operation.op === "suggest_merge") {
      for (const nodeId of [operation.survivorNodeId, ...operation.mergedNodeIds]) {
        if (!context.allowedNodeIds.has(nodeId)) {
          issues.push({ code: "unknown_reference", operationIndex: index, detail: nodeId });
        }
        if (context.pinnedNodeIds.has(nodeId)) {
          issues.push({ code: "pinned_node", operationIndex: index, detail: nodeId });
        }
      }
    }
  }

  return issues.length === 0 ? { ok: true, patch } : { ok: false, issues };
}

export function applyProviderPatch(
  input: unknown,
  current: ReducerGraphState,
  context: PatchValidationContext,
): PatchApplyResult {
  const validation = validateProviderPatch(input, context);
  if (!validation.ok) return validation;
  const patch = validation.patch;
  const nodes = current.nodes.map((node) => ({
    ...node,
    claims: node.claims.map((claim) => ({
      ...claim,
      evidenceEventIds: [...claim.evidenceEventIds],
    })),
    participantAgentIds: [...node.participantAgentIds],
    artifactIds: [...node.artifactIds],
    layout: node.layout ? { ...node.layout } : null,
  }));
  const edges = current.edges.map((edge) => ({ ...edge }));
  const temporaryNodeIds = new Map<string, string>();
  const changedNodeIds = new Set<string>();
  const changedEdgeIds = new Set<string>();
  const diagnostics = [...patch.diagnostics];

  const resolveNode = (ref: string): string => temporaryNodeIds.get(ref) ?? ref;
  for (const operation of patch.operations) {
    if (operation.op === "add_node") {
      const logicalNodeId = deterministicUuid(patch.jobNonce, `node:${operation.ref}`);
      temporaryNodeIds.set(operation.ref, logicalNodeId);
      nodes.push({
        logicalNodeId,
        versionId: deterministicUuid(patch.jobNonce, `node-version:${operation.ref}`),
        kind: operation.node.kind,
        status: operation.node.status,
        title: operation.node.title,
        claims: operation.node.claims.map(canonicalClaim),
        primaryParentId: operation.node.primaryParentRef
          ? resolveNode(operation.node.primaryParentRef)
          : null,
        primaryAgentId: operation.node.primaryAgentId ?? null,
        participantAgentIds: [...new Set(operation.node.participantAgentIds)],
        artifactIds: [...new Set(operation.node.artifactIds)],
        pinnedByHuman: false,
        startedAt: null,
        endedAt: null,
        layout: null,
      });
      changedNodeIds.add(logicalNodeId);
      continue;
    }

    if (operation.op === "update_node") {
      const index = nodes.findIndex((node) => node.logicalNodeId === operation.ref);
      const previous = nodes[index];
      if (index < 0 || !previous) continue;
      const set = operation.set;
      const cleared = new Set(operation.clear);
      const next: ReducerNode = {
        ...previous,
        versionId: deterministicUuid(patch.jobNonce, `node-version:update:${operation.ref}`),
        status: set.status ?? previous.status,
        title: set.title ?? previous.title,
        claims: set.claims ? set.claims.values.map(canonicalClaim) : previous.claims,
        primaryParentId: cleared.has("primaryParentRef")
          ? null
          : set.primaryParentRef
            ? resolveNode(set.primaryParentRef)
            : previous.primaryParentId,
        primaryAgentId: cleared.has("primaryAgentId")
          ? null
          : (set.primaryAgentId ?? previous.primaryAgentId),
        participantAgentIds: set.participantAgentIds
          ? updateArray(previous.participantAgentIds, set.participantAgentIds)
          : previous.participantAgentIds,
        artifactIds: set.artifactIds
          ? updateArray(previous.artifactIds, set.artifactIds)
          : previous.artifactIds,
      };
      nodes[index] = next;
      changedNodeIds.add(operation.ref);
      continue;
    }

    if (operation.op === "add_edge") {
      const logicalEdgeId = deterministicUuid(patch.jobNonce, `edge:${operation.ref}`);
      edges.push({
        logicalEdgeId,
        versionId: deterministicUuid(patch.jobNonce, `edge-version:${operation.ref}`),
        sourceNodeId: resolveNode(operation.sourceRef),
        targetNodeId: resolveNode(operation.targetRef),
        kind: operation.kind,
        retired: false,
      });
      changedEdgeIds.add(logicalEdgeId);
      continue;
    }

    if (operation.op === "retire_edge") {
      const index = edges.findIndex((edge) => edge.logicalEdgeId === operation.edgeId);
      const previous = edges[index];
      if (index < 0 || !previous) continue;
      edges[index] = {
        ...previous,
        versionId: deterministicUuid(patch.jobNonce, `edge-version:retire:${operation.edgeId}`),
        retired: true,
      };
      changedEdgeIds.add(operation.edgeId);
      continue;
    }

    if (operation.op === "supersede_node") {
      const index = nodes.findIndex((node) => node.logicalNodeId === operation.fromNodeId);
      const previous = nodes[index];
      if (index < 0 || !previous) continue;
      nodes[index] = {
        ...previous,
        versionId: deterministicUuid(
          patch.jobNonce,
          `node-version:supersede:${operation.fromNodeId}`,
        ),
        status: "superseded",
      };
      const edgeId = deterministicUuid(
        patch.jobNonce,
        `supersedes:${operation.fromNodeId}:${operation.toRef}`,
      );
      edges.push({
        logicalEdgeId: edgeId,
        versionId: deterministicUuid(patch.jobNonce, `edge-version:${edgeId}`),
        sourceNodeId: resolveNode(operation.toRef),
        targetNodeId: operation.fromNodeId,
        kind: "supersedes",
        retired: false,
      });
      changedNodeIds.add(operation.fromNodeId);
      changedEdgeIds.add(edgeId);
      continue;
    }

    diagnostics.push(
      `merge suggestion retained for human review: ${operation.mergedNodeIds.join(",")}`,
    );
  }

  const duplicate = edges.find(
    (edge, index) =>
      !edge.retired &&
      edges.some(
        (candidate, candidateIndex) =>
          candidateIndex < index &&
          !candidate.retired &&
          candidate.sourceNodeId === edge.sourceNodeId &&
          candidate.targetNodeId === edge.targetNodeId &&
          candidate.kind === edge.kind,
      ),
  );
  if (duplicate) {
    return {
      ok: false,
      issues: [{ code: "duplicate_edge", detail: duplicate.logicalEdgeId }],
    };
  }
  if (hierarchicalCycle(edges)) {
    return { ok: false, issues: [{ code: "cycle", detail: "hierarchical edge cycle" }] };
  }

  return {
    ok: true,
    patch,
    state: { nodes, edges },
    changedNodeIds: [...changedNodeIds],
    changedEdgeIds: [...changedEdgeIds],
    diagnostics,
  };
}
