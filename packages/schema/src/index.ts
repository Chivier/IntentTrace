import { z } from "zod";

export const SchemaVersion = "1.0.0" as const;

export const UuidSchema = z.string().uuid();
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, "expected lowercase SHA-256");
export const PositiveIntegerStringSchema = z.string().regex(/^[1-9][0-9]*$/u);
export const NonnegativeIntegerStringSchema = z.string().regex(/^(?:0|[1-9][0-9]*)$/u);
export const TimestampSchema = z.string().datetime({ offset: true });
export const IdentifierSchema = z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/u);
export const TemporaryNodeRefSchema = z.string().regex(/^tmp:[1-9][0-9]*$/u);
export const NodeRefSchema = z.union([UuidSchema, TemporaryNodeRefSchema]);

export const TraceSourceKindSchema = z.enum(["jsonl", "otlp", "codex", "claude", "custom"]);
export type TraceSourceKind = z.infer<typeof TraceSourceKindSchema>;

export const RawEventKindSchema = z.enum([
  "user_message",
  "assistant_message",
  "agent_start",
  "agent_end",
  "agent_handoff",
  "span_start",
  "span_end",
  "model_call",
  "tool_call",
  "tool_result",
  "file_read",
  "file_write",
  "shell_command",
  "test_run",
  "artifact",
  "error",
  "log",
  "correction",
  "trace_complete",
]);
export type RawEventKind = z.infer<typeof RawEventKindSchema>;

export const EventStatusSchema = z.enum(["unset", "ok", "error"]);

export const RawTraceEventSchema = z
  .object({
    schemaVersion: z.literal(SchemaVersion),
    id: UuidSchema,
    workspaceId: UuidSchema,
    projectId: UuidSchema,
    traceId: UuidSchema,
    source: z
      .object({
        kind: TraceSourceKindSchema,
        formatVersion: z.string().min(1).max(64),
        adapterVersion: z.string().min(1).max(64),
        sourceInstanceId: IdentifierSchema,
        sourceEventId: IdentifierSchema,
      })
      .strict(),
    ingestSeq: PositiveIntegerStringSchema,
    occurredAt: TimestampSchema,
    ingestedAt: TimestampSchema,
    kind: RawEventKindSchema,
    name: z.string().min(1).max(240),
    status: EventStatusSchema,
    subjectId: IdentifierSchema.optional(),
    causationEventId: UuidSchema.optional(),
    agentId: IdentifierSchema.optional(),
    spanId: IdentifierSchema.optional(),
    parentSpanId: IdentifierSchema.optional(),
    payloadRef: z
      .object({
        artifactId: UuidSchema,
        sha256: Sha256Schema,
        byteLength: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    artifactRefs: z.array(UuidSchema).max(64),
    attributes: z.record(z.string().max(128), z.unknown()),
  })
  .strict();
export type RawTraceEvent = z.infer<typeof RawTraceEventSchema>;

export const SemanticNodeKindSchema = z.enum([
  "request",
  "goal",
  "work",
  "decision",
  "issue",
  "handoff",
  "result",
]);
export const SemanticNodeStatusSchema = z.enum([
  "proposed",
  "active",
  "blocked",
  "completed",
  "abandoned",
  "superseded",
]);
export const ProvenanceSchema = z.enum(["stated", "inferred", "mixed"]);
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export const ClaimKindSchema = z.enum(["intent", "action", "outcome"]);

export const ProviderClaimSchema = z
  .object({
    kind: ClaimKindSchema,
    text: z.string().min(1).max(480),
    provenance: ProvenanceSchema,
    suggestedConfidence: ConfidenceSchema,
    evidenceEventIds: z.array(UuidSchema).min(1).max(64),
  })
  .strict();

export const CanonicalClaimSchema = ProviderClaimSchema.omit({ suggestedConfidence: true })
  .extend({ confidence: ConfidenceSchema })
  .strict();

export const SemanticEdgeKindSchema = z.enum([
  "decomposes_to",
  "attempts",
  "depends_on",
  "supports",
  "blocks",
  "resolved_by",
  "hands_off_to",
  "revises",
  "produces",
  "supersedes",
]);

export const SemanticRevisionSchema = z
  .object({
    id: UuidSchema,
    traceId: UuidSchema,
    parentRevisionId: UuidSchema.nullable(),
    branchKind: z.enum(["live", "final", "human", "alternate_model"]),
    eventWatermark: NonnegativeIntegerStringSchema,
    createdAt: TimestampSchema,
    sourceJobId: UuidSchema.nullable(),
  })
  .strict();

export const SemanticNodeVersionSchema = z
  .object({
    id: UuidSchema,
    logicalNodeId: UuidSchema,
    traceId: UuidSchema,
    kind: SemanticNodeKindSchema,
    status: SemanticNodeStatusSchema,
    title: z.string().min(3).max(80),
    claims: z.array(CanonicalClaimSchema).min(1).max(3),
    primaryParentId: UuidSchema.nullable(),
    primaryAgentId: IdentifierSchema.nullable(),
    participantAgentIds: z.array(IdentifierSchema).max(32),
    artifactIds: z.array(UuidSchema).max(64),
    pinnedByHuman: z.boolean(),
    startedAt: TimestampSchema.nullable(),
    endedAt: TimestampSchema.nullable(),
  })
  .strict();

const AddNodeOperationSchema = z
  .object({
    op: z.literal("add_node"),
    ref: TemporaryNodeRefSchema,
    node: z
      .object({
        kind: SemanticNodeKindSchema,
        status: SemanticNodeStatusSchema.exclude(["superseded"]),
        title: z.string().min(3).max(80),
        claims: z.array(ProviderClaimSchema).min(1).max(3),
        primaryParentRef: NodeRefSchema.optional(),
        primaryAgentId: IdentifierSchema.optional(),
        participantAgentIds: z.array(IdentifierSchema).max(32),
        artifactIds: z.array(UuidSchema).max(64),
      })
      .strict(),
  })
  .strict();

const ClaimArrayUpdateSchema = z
  .object({
    operation: z.literal("replace"),
    values: z.array(ProviderClaimSchema).min(1).max(3),
  })
  .strict();

const AgentArrayUpdateSchema = z
  .object({
    operation: z.enum(["replace", "append_unique", "remove"]),
    values: z.array(IdentifierSchema).max(32),
  })
  .strict();

const ArtifactArrayUpdateSchema = z
  .object({
    operation: z.enum(["replace", "append_unique", "remove"]),
    values: z.array(UuidSchema).max(64),
  })
  .strict();

const UpdateNodeOperationSchema = z
  .object({
    op: z.literal("update_node"),
    ref: UuidSchema,
    set: z
      .object({
        status: SemanticNodeStatusSchema.optional(),
        title: z.string().min(3).max(80).optional(),
        claims: ClaimArrayUpdateSchema.optional(),
        primaryParentRef: NodeRefSchema.optional(),
        primaryAgentId: IdentifierSchema.optional(),
        participantAgentIds: AgentArrayUpdateSchema.optional(),
        artifactIds: ArtifactArrayUpdateSchema.optional(),
      })
      .strict(),
    clear: z.array(z.enum(["primaryParentRef", "primaryAgentId"])).max(2),
    evidenceEventIds: z.array(UuidSchema).min(1).max(64),
  })
  .strict()
  .refine((value) => Object.keys(value.set).length > 0 || value.clear.length > 0, {
    message: "update_node must set or clear at least one field",
  });

const AddEdgeOperationSchema = z
  .object({
    op: z.literal("add_edge"),
    ref: z.string().regex(/^tmp-edge:[1-9][0-9]*$/u),
    sourceRef: NodeRefSchema,
    targetRef: NodeRefSchema,
    kind: SemanticEdgeKindSchema,
    evidenceEventIds: z.array(UuidSchema).min(1).max(64),
  })
  .strict();

const RetireEdgeOperationSchema = z
  .object({
    op: z.literal("retire_edge"),
    edgeId: UuidSchema,
    reason: z.string().min(1).max(240),
    evidenceEventIds: z.array(UuidSchema).min(1).max(64),
  })
  .strict();

const SupersedeNodeOperationSchema = z
  .object({
    op: z.literal("supersede_node"),
    fromNodeId: UuidSchema,
    toRef: NodeRefSchema,
    reason: z.string().min(1).max(240),
    evidenceEventIds: z.array(UuidSchema).min(1).max(64),
  })
  .strict();

const MergeSuggestionOperationSchema = z
  .object({
    op: z.literal("suggest_merge"),
    survivorNodeId: UuidSchema,
    mergedNodeIds: z.array(UuidSchema).min(1).max(7),
    reason: z.string().min(1).max(240),
    evidenceEventIds: z.array(UuidSchema).min(1).max(64),
  })
  .strict();

export const PatchOperationSchema = z.discriminatedUnion("op", [
  AddNodeOperationSchema,
  UpdateNodeOperationSchema,
  AddEdgeOperationSchema,
  RetireEdgeOperationSchema,
  SupersedeNodeOperationSchema,
  MergeSuggestionOperationSchema,
]);

export const ProviderIntentGraphPatchSchema = z
  .object({
    schemaVersion: z.literal(SchemaVersion),
    jobNonce: UuidSchema,
    baseRevisionId: UuidSchema,
    operations: z.array(PatchOperationSchema).max(64),
    diagnostics: z.array(z.string().min(1).max(240)).max(8),
  })
  .strict();
export type ProviderIntentGraphPatch = z.infer<typeof ProviderIntentGraphPatchSchema>;

export const SummaryJobEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(SchemaVersion),
    id: UuidSchema,
    jobNonce: UuidSchema,
    traceId: UuidSchema,
    chunkId: UuidSchema,
    baseRevisionId: UuidSchema,
    inputHash: Sha256Schema,
    promptVersion: IdentifierSchema,
    policyVersion: IdentifierSchema,
    allowedEventIds: z.array(UuidSchema).max(4096),
    allowedArtifactIds: z.array(UuidSchema).max(1024),
    allowedAgentIds: z.array(IdentifierSchema).max(128),
    allowedNodeIds: z.array(UuidSchema).max(2048),
  })
  .strict();

export const SseEventTypeSchema = z.enum([
  "raw_event.appended",
  "trace.metrics.updated",
  "semantic_chunk.pending",
  "semantic_node.committed",
  "semantic_node.updated",
  "semantic_edge.committed",
  "semantic_revision.created",
  "summary.failed",
  "trace.completed",
  "resync.required",
  "heartbeat",
]);

export const SseEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(SchemaVersion),
    eventId: PositiveIntegerStringSchema,
    traceId: UuidSchema,
    occurredAt: TimestampSchema,
    revisionId: UuidSchema.nullable(),
    type: SseEventTypeSchema,
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const ProblemDetailsSchema = z
  .object({
    type: z.string().url(),
    title: z.string().min(1).max(120),
    status: z.number().int().min(400).max(599),
    detail: z.string().max(1000).optional(),
    instance: z.string().max(240).optional(),
    code: IdentifierSchema,
    requestId: UuidSchema,
  })
  .strict();
