import type { IntentTraceRepository } from "@intenttrace/db";
import type { ArtifactStore } from "@intenttrace/storage";

export interface ApiServices {
  repository: Pick<
    IntentTraceRepository,
    | "ensureTrace"
    | "registerArtifact"
    | "getArtifact"
    | "ingest"
    | "listTraces"
    | "getTrace"
    | "listRawEvents"
    | "getAgentTimeline"
    | "listStreamEvents"
    | "getStreamBounds"
    | "listProviderCalls"
    | "getGraph"
    | "editSemanticNode"
    | "deleteTraceData"
  >;
  artifactStore: ArtifactStore;
}

function unavailable(): never {
  throw new Error("API data services are unavailable");
}

export function createUnavailableApiServices(): ApiServices {
  return {
    repository: {
      ensureTrace: async () => unavailable(),
      registerArtifact: async () => unavailable(),
      getArtifact: async () => unavailable(),
      ingest: async () => unavailable(),
      listTraces: async () => unavailable(),
      getTrace: async () => unavailable(),
      listRawEvents: async () => unavailable(),
      getAgentTimeline: async () => unavailable(),
      listStreamEvents: async () => unavailable(),
      getStreamBounds: async () => unavailable(),
      listProviderCalls: async () => unavailable(),
      getGraph: async () => unavailable(),
      editSemanticNode: async () => unavailable(),
      deleteTraceData: async () => unavailable(),
    },
    artifactStore: {
      put: async () => unavailable(),
      stat: async () => unavailable(),
      getRange: async () => unavailable(),
      deleteTrace: async () => unavailable(),
    },
  };
}
