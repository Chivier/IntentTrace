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

export const SessionCatalogIdSchema = z.string().regex(/^[a-f0-9]{24}$/u);
export const SessionCatalogEntrySchema = z
  .object({
    id: SessionCatalogIdSchema,
    source: TraceSourceKindSchema,
    title: z.string().min(1).max(240),
    projectHint: z.string().min(1).max(120).nullable(),
    firstPromptPreview: z.string().min(1).max(160).nullable(),
    lastPromptPreview: z.string().min(1).max(160).nullable(),
    lastActivityAt: TimestampSchema,
    byteLength: z.number().int().nonnegative(),
    eventCount: z.number().int().positive(),
    warningCount: z.number().int().nonnegative(),
    modifiedAt: TimestampSchema,
  })
  .strict();
export type SessionCatalogEntry = z.infer<typeof SessionCatalogEntrySchema>;

export const SessionCatalogFailureCodeSchema = z.enum([
  "preflight_failed",
  "unsupported_version",
  "no_visible_events",
  "stale_session",
  "file_too_large",
  "unknown_source_format",
]);
export const SessionCatalogFailureSchema = z
  .object({
    id: SessionCatalogIdSchema,
    code: SessionCatalogFailureCodeSchema,
    message: z.string().min(1).max(500),
  })
  .strict();
export type SessionCatalogFailure = z.infer<typeof SessionCatalogFailureSchema>;

export const SessionCatalogSchema = z
  .object({
    catalogVersion: z.literal(1),
    command: z.enum(["discover", "import"]),
    source: TraceSourceKindSchema,
    dryRun: z.literal(true).optional(),
    matchedFiles: z.number().int().nonnegative(),
    selectedFiles: z.number().int().nonnegative(),
    sessions: z.array(SessionCatalogEntrySchema),
    failed: z.array(SessionCatalogFailureSchema),
    skippedByLimit: z.number().int().nonnegative(),
    unreadableDirectories: z.number().int().nonnegative(),
    rejectedFiles: z.number().int().nonnegative(),
    missingSessionIds: z.array(SessionCatalogIdSchema),
  })
  .strict();
export type SessionCatalog = z.infer<typeof SessionCatalogSchema>;

export const SessionImportOutcomeSchema = z
  .object({
    protocolVersion: z.literal(1),
    level: z.literal("result"),
    command: z.enum(["import", "follow", "upload"]),
    sessionId: SessionCatalogIdSchema,
    traceId: UuidSchema,
    inserted: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  })
  .strict();
export type SessionImportOutcome = z.infer<typeof SessionImportOutcomeSchema>;

export const SessionImportSummarySchema = z
  .object({
    protocolVersion: z.literal(1),
    level: z.literal("summary"),
    command: z.literal("import"),
    source: TraceSourceKindSchema,
    files: z.number().int().nonnegative(),
    imported: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    inserted: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    matchedFiles: z.number().int().nonnegative(),
    skippedByLimit: z.number().int().nonnegative(),
    unreadableDirectories: z.number().int().nonnegative(),
    rejectedFiles: z.number().int().nonnegative(),
    missingSessionIds: z.array(SessionCatalogIdSchema),
    firstError: z.string().min(1).max(500).optional(),
  })
  .strict();
export type SessionImportSummary = z.infer<typeof SessionImportSummarySchema>;

export const SessionUploadCandidateInputSchema = z
  .object({
    clientRef: z.string().min(1).max(64),
    fileName: z.string().min(1).max(255),
    byteLength: z.number().int().nonnegative(),
    modifiedAt: TimestampSchema,
    headBase64: z.string().max(131072),
    complete: z.boolean(),
  })
  .strict();

export const SessionUploadCandidateRequestSchema = z
  .object({
    protocolVersion: z.literal(1),
    includePreviews: z.boolean(),
    candidates: z.array(SessionUploadCandidateInputSchema).min(1).max(50),
  })
  .strict();
export type SessionUploadCandidateRequest = z.infer<typeof SessionUploadCandidateRequestSchema>;

export const SessionUploadCandidateSchema = z
  .object({
    clientRef: z.string().min(1).max(64),
    source: TraceSourceKindSchema.nullable(),
    title: z.string().min(1).max(240).nullable(),
    projectHint: z.string().min(1).max(120).nullable(),
    firstPromptPreview: z.string().min(1).max(160).nullable(),
    lastPromptPreview: z.string().min(1).max(160).nullable(),
    partialHead: z.boolean(),
    traceId: UuidSchema.nullable(),
    imported: z.boolean(),
    importedEventCount: NonnegativeIntegerStringSchema.nullable(),
    failureCode: SessionCatalogFailureCodeSchema.nullable(),
    failureMessage: z.string().min(1).max(500).nullable(),
  })
  .strict();

export const SessionUploadCandidateListSchema = z
  .object({
    protocolVersion: z.literal(1),
    candidates: z.array(SessionUploadCandidateSchema),
    alreadyImportedCount: z.number().int().nonnegative(),
  })
  .strict();
export type SessionUploadCandidateList = z.infer<typeof SessionUploadCandidateListSchema>;

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
export type EventStatus = z.infer<typeof EventStatusSchema>;

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

export const RawTraceEventInputSchema = RawTraceEventSchema.omit({
  id: true,
  ingestSeq: true,
  ingestedAt: true,
})
  .extend({
    workspaceName: z.string().min(1).max(120).optional(),
    projectName: z.string().min(1).max(120).optional(),
    traceTitle: z.string().min(1).max(240).optional(),
    payload: z.unknown().optional(),
  })
  .strict();
export type RawTraceEventInput = z.infer<typeof RawTraceEventInputSchema>;

export const IngestResultSchema = z
  .object({
    event: RawTraceEventSchema,
    duplicate: z.boolean(),
    traceStale: z.boolean(),
  })
  .strict();
export type IngestResult = z.infer<typeof IngestResultSchema>;

export const TraceSummarySchema = z
  .object({
    id: UuidSchema,
    projectId: UuidSchema,
    title: z.string().min(1).max(240),
    status: z.enum(["active", "completed", "stale", "failed"]),
    eventCount: NonnegativeIntegerStringSchema,
    latestIngestSeq: NonnegativeIntegerStringSchema,
    latestRevisionId: UuidSchema.nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .strict();
export type TraceSummary = z.infer<typeof TraceSummarySchema>;

export const TraceListSchema = z
  .object({
    traces: z.array(TraceSummarySchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type TraceList = z.infer<typeof TraceListSchema>;

export const RawEventPageSchema = z
  .object({
    events: z.array(RawTraceEventSchema),
    nextCursor: PositiveIntegerStringSchema.nullable(),
  })
  .strict();
export type RawEventPage = z.infer<typeof RawEventPageSchema>;

export const AgentTimelineLaneSchema = z
  .object({
    agentId: IdentifierSchema,
    displayName: z.string().min(1).max(120),
    eventIds: z.array(UuidSchema),
    startedAt: TimestampSchema,
    endedAt: TimestampSchema,
    errorCount: z.number().int().nonnegative(),
  })
  .strict();
export type AgentTimelineLane = z.infer<typeof AgentTimelineLaneSchema>;

export const SemanticNodeKindSchema = z.enum([
  "request",
  "goal",
  "work",
  "decision",
  "issue",
  "handoff",
  "result",
]);
export type SemanticNodeKind = z.infer<typeof SemanticNodeKindSchema>;
export const SemanticNodeStatusSchema = z.enum([
  "proposed",
  "active",
  "blocked",
  "completed",
  "abandoned",
  "superseded",
]);
export type SemanticNodeStatus = z.infer<typeof SemanticNodeStatusSchema>;
export const ProvenanceSchema = z.enum(["stated", "inferred", "mixed"]);
export type Provenance = z.infer<typeof ProvenanceSchema>;
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;
export const ClaimKindSchema = z.enum(["intent", "action", "outcome"]);
export type ClaimKind = z.infer<typeof ClaimKindSchema>;

export const ProviderClaimSchema = z
  .object({
    kind: ClaimKindSchema,
    text: z.string().min(1).max(480),
    provenance: ProvenanceSchema,
    suggestedConfidence: ConfidenceSchema,
    evidenceEventIds: z.array(UuidSchema).min(1).max(64),
  })
  .strict();
export type ProviderClaim = z.infer<typeof ProviderClaimSchema>;

export const CanonicalClaimSchema = ProviderClaimSchema.omit({ suggestedConfidence: true })
  .extend({ confidence: ConfidenceSchema })
  .strict();
export type CanonicalClaim = z.infer<typeof CanonicalClaimSchema>;

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
export type SemanticEdgeKind = z.infer<typeof SemanticEdgeKindSchema>;

export const SemanticRevisionSchema = z
  .object({
    id: UuidSchema,
    traceId: UuidSchema,
    parentRevisionId: UuidSchema.nullable(),
    branchKind: z.enum(["live", "final", "human", "alternate_model"]),
    eventWatermark: NonnegativeIntegerStringSchema,
    createdAt: TimestampSchema,
    sourceJobId: UuidSchema.nullable(),
    stale: z.boolean().default(false),
  })
  .strict();
export type SemanticRevision = z.infer<typeof SemanticRevisionSchema>;

export const SemanticRevisionListSchema = z
  .object({ revisions: z.array(SemanticRevisionSchema) })
  .strict();
export type SemanticRevisionList = z.infer<typeof SemanticRevisionListSchema>;

export const TraceSnapshotSchema = z
  .object({
    trace: TraceSummarySchema,
    raw: RawEventPageSchema,
    agents: z.array(AgentTimelineLaneSchema),
    revision: SemanticRevisionSchema.nullable(),
  })
  .strict();
export type TraceSnapshot = z.infer<typeof TraceSnapshotSchema>;

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
    layout: z
      .object({ x: z.number().finite(), y: z.number().finite() })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();
export type SemanticNodeVersion = z.infer<typeof SemanticNodeVersionSchema>;

export const SemanticEdgeVersionSchema = z
  .object({
    id: UuidSchema,
    logicalEdgeId: UuidSchema,
    traceId: UuidSchema,
    sourceNodeId: UuidSchema,
    targetNodeId: UuidSchema,
    kind: SemanticEdgeKindSchema,
    retired: z.boolean(),
  })
  .strict();
export type SemanticEdgeVersion = z.infer<typeof SemanticEdgeVersionSchema>;

export const SemanticGraphSnapshotSchema = z
  .object({
    revision: SemanticRevisionSchema,
    nodes: z.array(SemanticNodeVersionSchema),
    edges: z.array(SemanticEdgeVersionSchema),
  })
  .strict();
export type SemanticGraphSnapshot = z.infer<typeof SemanticGraphSnapshotSchema>;

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
export type SseEventType = z.infer<typeof SseEventTypeSchema>;
export type SseEnvelope = z.infer<typeof SseEnvelopeSchema>;

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

export const HumanNodeEditSchema = z
  .object({
    baseRevisionId: UuidSchema,
    title: z.string().min(3).max(80).optional(),
    status: SemanticNodeStatusSchema.optional(),
    pinned: z.boolean().optional(),
    feedback: z.string().min(1).max(1000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.status !== undefined ||
      value.pinned !== undefined ||
      value.feedback !== undefined,
    { message: "human edit must change at least one field" },
  );
export type HumanNodeEdit = z.infer<typeof HumanNodeEditSchema>;

export const OtlpPartialSuccessSchema = z
  .object({
    partialSuccess: z
      .object({
        rejectedSpans: z.number().int().nonnegative(),
        errorMessage: z.string(),
      })
      .strict(),
  })
  .strict();

export const ProviderCallAuditSchema = z
  .object({
    id: UuidSchema,
    summaryJobId: UuidSchema,
    provider: IdentifierSchema,
    model: z.string().min(1).max(240),
    status: IdentifierSchema,
    inputTokens: NonnegativeIntegerStringSchema.nullable(),
    outputTokens: NonnegativeIntegerStringSchema.nullable(),
    costUsd: z
      .string()
      .regex(/^\d+(?:\.\d+)?$/u)
      .nullable(),
    createdAt: TimestampSchema,
  })
  .strict();
export type ProviderCallAudit = z.infer<typeof ProviderCallAuditSchema>;

export const ProviderCallAuditListSchema = z
  .object({ calls: z.array(ProviderCallAuditSchema) })
  .strict();
export type ProviderCallAuditList = z.infer<typeof ProviderCallAuditListSchema>;
