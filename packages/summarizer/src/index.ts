import {
  ProviderIntentGraphPatchSchema,
  SchemaVersion,
  type ProviderIntentGraphPatch,
} from "@intenttrace/schema";

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
}

export class FoundationMockSummaryProvider implements SummaryProvider {
  readonly id = "foundation-mock-v1";
  readonly egress = "none" as const;

  async extractUserIntent(input: UserIntentInput): Promise<ProviderIntentGraphPatch> {
    return this.emptyPatch(input.jobNonce, input.baseRevisionId);
  }

  async summarizeChunk(input: ChunkSummaryInput): Promise<ProviderIntentGraphPatch> {
    return this.emptyPatch(input.jobNonce, input.baseRevisionId);
  }

  async reconcileGraph(input: ReconcileInput): Promise<ProviderIntentGraphPatch> {
    return this.emptyPatch(input.jobNonce, input.baseRevisionId);
  }

  private emptyPatch(jobNonce: string, baseRevisionId: string): ProviderIntentGraphPatch {
    return ProviderIntentGraphPatchSchema.parse({
      schemaVersion: SchemaVersion,
      jobNonce,
      baseRevisionId,
      operations: [],
      diagnostics: ["Gate 0 mock emits no semantic claims"],
    });
  }
}
