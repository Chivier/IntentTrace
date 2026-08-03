import {
  ProviderIntentGraphPatchSchema,
  SchemaVersion,
  type ProviderIntentGraphPatch,
} from "@intenttrace/schema";

export * from "./providers.js";
export * from "./provider-registry.js";
export * from "./security.js";

export interface UserIntentInput {
  jobNonce: string;
  baseRevisionId: string;
  requestEventId: string;
  requestText: string;
  locale: string;
}

export interface ChunkSummaryInput {
  jobNonce: string;
  baseRevisionId: string;
  eventSketch: readonly string[];
  allowedEventIds: readonly string[];
  allowedArtifactIds: readonly string[];
  allowedAgentIds: readonly string[];
  allowedNodeIds: readonly string[];
  locale: string;
}

export interface ReconcileInput extends ChunkSummaryInput {
  finalArtifactIds: readonly string[];
}

export interface SummaryProvider {
  readonly id: string;
  readonly egress: "none" | "local" | "cloud";
  extractUserIntent(input: UserIntentInput): Promise<ProviderIntentGraphPatch>;
  summarizeChunk(input: ChunkSummaryInput): Promise<ProviderIntentGraphPatch>;
  reconcileGraph(input: ReconcileInput): Promise<ProviderIntentGraphPatch>;
  takeUsage?(): ProviderUsage | null;
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
}

export class FoundationMockSummaryProvider implements SummaryProvider {
  readonly id = "deterministic-mock-v1";
  readonly egress = "none" as const;

  async extractUserIntent(input: UserIntentInput): Promise<ProviderIntentGraphPatch> {
    return ProviderIntentGraphPatchSchema.parse({
      schemaVersion: SchemaVersion,
      jobNonce: input.jobNonce,
      baseRevisionId: input.baseRevisionId,
      operations: [
        {
          op: "add_node",
          ref: "tmp:1",
          node: {
            kind: "request",
            status: "active",
            title: clipTitle(input.requestText, "User request"),
            claims: [
              {
                kind: "intent",
                text: input.requestText.slice(0, 480),
                provenance: "stated",
                suggestedConfidence: "high",
                evidenceEventIds: [input.requestEventId],
              },
            ],
            participantAgentIds: [],
            artifactIds: [],
          },
        },
      ],
      diagnostics: ["deterministic offline request extraction"],
    });
  }

  async summarizeChunk(input: ChunkSummaryInput): Promise<ProviderIntentGraphPatch> {
    const latest = parseSketch(input.eventSketch.at(-1));
    if (!latest || !input.allowedEventIds.includes(latest.eventId)) {
      return this.emptyPatch(input.jobNonce, input.baseRevisionId, "no eligible event in chunk");
    }
    const isFinal = latest.kind === "trace_complete";
    const priorNode = input.allowedNodeIds.at(-1);
    const operations: ProviderIntentGraphPatch["operations"] = [
      {
        op: "add_node",
        ref: "tmp:1",
        node: {
          kind: isFinal ? "result" : latest.status === "error" ? "issue" : "work",
          status: isFinal ? "completed" : latest.status === "error" ? "blocked" : "active",
          title: clipTitle(latest.name, isFinal ? "Trace result" : "Observed work"),
          claims: [
            {
              kind: isFinal ? "outcome" : "action",
              text: latest.name.slice(0, 480),
              provenance: "stated",
              suggestedConfidence: "high",
              evidenceEventIds: [latest.eventId],
            },
          ],
          primaryParentRef: priorNode,
          primaryAgentId: input.allowedAgentIds.includes(latest.agentId)
            ? latest.agentId
            : undefined,
          participantAgentIds: input.allowedAgentIds.includes(latest.agentId)
            ? [latest.agentId]
            : [],
          artifactIds: [],
        },
      },
    ];
    if (priorNode) {
      operations.push({
        op: "add_edge",
        ref: "tmp-edge:1",
        sourceRef: priorNode,
        targetRef: "tmp:1",
        kind: isFinal ? "produces" : "attempts",
        evidenceEventIds: [latest.eventId],
      });
    }
    return ProviderIntentGraphPatchSchema.parse({
      schemaVersion: SchemaVersion,
      jobNonce: input.jobNonce,
      baseRevisionId: input.baseRevisionId,
      operations,
      diagnostics: ["deterministic offline chunk summarization"],
    });
  }

  async reconcileGraph(input: ReconcileInput): Promise<ProviderIntentGraphPatch> {
    return this.summarizeChunk(input);
  }

  private emptyPatch(
    jobNonce: string,
    baseRevisionId: string,
    diagnostic = "deterministic mock found no semantic delta",
  ): ProviderIntentGraphPatch {
    return ProviderIntentGraphPatchSchema.parse({
      schemaVersion: SchemaVersion,
      jobNonce,
      baseRevisionId,
      operations: [],
      diagnostics: [diagnostic],
    });
  }
}

function clipTitle(value: string, fallback: string): string {
  const normalized = value.replaceAll(/\s+/gu, " ").trim();
  const candidate = normalized.length >= 3 ? normalized : fallback;
  return candidate.slice(0, 80);
}

function parseSketch(value: string | undefined): {
  eventId: string;
  kind: string;
  status: string;
  agentId: string;
  name: string;
} | null {
  if (!value) return null;
  const [eventId, kind, status, agentId, ...name] = value.split("|");
  if (!eventId || !kind || !status || !agentId || name.length === 0) return null;
  return { eventId, kind, status, agentId, name: name.join("|") };
}
