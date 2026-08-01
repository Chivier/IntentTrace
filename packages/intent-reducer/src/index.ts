import { ProviderIntentGraphPatchSchema, type ProviderIntentGraphPatch } from "@intenttrace/schema";

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
    | "self_edge"
    | "pinned_node";
  operationIndex?: number;
  detail: string;
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
