import type {
  TopologyCapability,
  TopologyFidelity,
  TraceSourceKind,
} from "@intenttrace/schema";

import { ClaudeSessionAdapter } from "./claude.js";
import { CodexSessionAdapter } from "./codex.js";
import { CanonicalJsonlAdapter } from "./jsonl.js";
import { OtlpHttpJsonAdapter } from "./otlp.js";
import { normalizeAdapterInput, type AdapterInput, type TraceAdapter } from "./types.js";

interface TopologyDeclarationEntry {
  sourceKind: TraceSourceKind;
  adapterVersion: string | "*";
  capability: TopologyCapability;
}

const topologyDeclarationTable: readonly TopologyDeclarationEntry[] = [
  { sourceKind: "codex", adapterVersion: "2.0.0", capability: {
    spawn: "stated", join: "stated", peerMessages: "stated", input: "bundle",
    laneKey: "session_meta.payload.id", limits: [
      "Full-history forks duplicate ancestor records and require payload-hash deduplication.",
      "Paginated history may omit persisted sub_agent_activity, so affected spawn facts are inferred or absent.",
      "Collaboration message bodies are encrypted and unavailable.",
    ],
  } },
  { sourceKind: "claude", adapterVersion: "2.0.0", capability: {
    spawn: "stated", join: "stated", peerMessages: "inferred", input: "bundle",
    laneKey: "agentId", limits: [
      "Workflow sidecars without toolUseId cannot be linked to a parent turn.",
      "Peer-message sender identity is inferred by pairing sender and recipient records.",
      "Async task notifications may repeat and require task-id/tool-use-id deduplication.",
    ],
  } },
  { sourceKind: "opencode", adapterVersion: "1.0.0", capability: {
    spawn: "stated", join: "stated", peerMessages: "unsupported", input: "bundle",
    laneKey: "session.id", limits: [
      "The SQLite WAL is required for uncheckpointed sessions.",
      "Failed task spawns may omit the child session id.",
      "Truncated task outputs require the referenced overflow part.",
    ],
  } },
  { sourceKind: "grok", adapterVersion: "1.0.0", capability: {
    spawn: "stated", join: "stated", peerMessages: "unsupported", input: "bundle",
    laneKey: "resumed_from chain root", limits: [
      "parent_prompt_id is optional; missing values leave parentSpanId empty.",
      "Logical lanes collapse resumed_from session chains.",
      "Agent structure is carried by vendor session/update records.",
    ],
  } },
  { sourceKind: "omp", adapterVersion: "1.0.0", capability: {
    spawn: "inferred", join: "stated", peerMessages: "stated", input: "bundle",
    laneKey: "agent name (file basename)", limits: [
      "Spawn parentage is inferred from bundle layout and agent-name equality.",
      "Spawn toolCallId is absent from child sessions, so parentSpanId is empty.",
      "Long outputs and blobs require explicitly supplied companion parts.",
    ],
  } },
  { sourceKind: "pi", adapterVersion: "*", capability: {
    spawn: "unsupported", join: "unsupported", peerMessages: "unsupported", input: "single-file",
    laneKey: "session.id", limits: [
      "Default Pi has no structural subagent capability; bash launches and parentSession forks are not spawn facts.",
    ],
  } },
  { sourceKind: "jsonl", adapterVersion: "1.0.0", capability: {
    spawn: "passthrough", join: "passthrough", peerMessages: "passthrough", input: "single-file",
    laneKey: "agentId", limits: [
      "Topology requires explicit canonical fields; passthrough never infers a missing relationship.",
    ],
  } },
  { sourceKind: "otlp", adapterVersion: "1.0.0", capability: {
    spawn: "passthrough", join: "passthrough", peerMessages: "unsupported", input: "single-file",
    laneKey: "service.name", limits: [
      "Spawn and join require explicit canonical topology attributes; peer messages are unsupported.",
    ],
  } },
];

const sourceShapes: Record<TraceSourceKind, Pick<TopologyCapability, "input" | "laneKey">> = {
  jsonl: { input: "single-file", laneKey: "agentId" },
  otlp: { input: "single-file", laneKey: "service.name" },
  codex: { input: "bundle", laneKey: "session_meta.payload.id" },
  claude: { input: "bundle", laneKey: "agentId" },
  opencode: { input: "bundle", laneKey: "session.id" },
  omp: { input: "bundle", laneKey: "agent name (file basename)" },
  grok: { input: "bundle", laneKey: "resumed_from chain root" },
  pi: { input: "single-file", laneKey: "session.id" },
  custom: { input: "single-file", laneKey: "custom" },
};

function copyCapability(capability: TopologyCapability): TopologyCapability {
  return { ...capability, limits: [...capability.limits] };
}

export function lookupTopologyCapability(sourceKind: TraceSourceKind, adapterVersion: string): TopologyCapability {
  const exact = topologyDeclarationTable.find((entry) => entry.sourceKind === sourceKind && entry.adapterVersion === adapterVersion);
  const wildcard = topologyDeclarationTable.find((entry) => entry.sourceKind === sourceKind && entry.adapterVersion === "*");
  const entry = exact ?? wildcard;
  if (entry) return copyCapability(entry.capability);
  return {
    spawn: "unsupported", join: "unsupported", peerMessages: "unsupported",
    ...sourceShapes[sourceKind], limits: [`No topology declaration for ${sourceKind}@${adapterVersion}`],
  };
}

function aggregateFidelity(values: readonly TopologyFidelity[]): TopologyFidelity {
  if (values.some((value) => value === "unsupported")) return "unsupported";
  const first = values[0];
  return first !== undefined && values.every((value) => value === first) && (first === "stated" || first === "passthrough")
    ? first : "inferred";
}

export function aggregateTopologyCapabilities(
  sources: readonly { sourceKind: TraceSourceKind; adapterVersion: string }[],
): TopologyCapability {
  if (sources.length === 0) return {
    spawn: "unsupported", join: "unsupported", peerMessages: "unsupported",
    input: "single-file", laneKey: "mixed", limits: [],
  };
  const declarations = sources.map((source) => ({ ...source, capability: lookupTopologyCapability(source.sourceKind, source.adapterVersion) }));
  return {
    spawn: aggregateFidelity(declarations.map(({ capability }) => capability.spawn)),
    join: aggregateFidelity(declarations.map(({ capability }) => capability.join)),
    peerMessages: aggregateFidelity(declarations.map(({ capability }) => capability.peerMessages)),
    input: declarations.some(({ capability }) => capability.input === "bundle") ? "bundle" : "single-file",
    laneKey: sources.length === 1 ? declarations[0]!.capability.laneKey : "mixed",
    limits: declarations.flatMap(({ sourceKind, adapterVersion, capability }) =>
      capability.limits.map((limit) => `${sourceKind}@${adapterVersion}: ${limit}`))
      .filter((limit, index, limits) => limits.indexOf(limit) === index).sort(),
  };
}

export function createAdapter(source: TraceSourceKind): TraceAdapter {
  switch (source) {
    case "jsonl": return new CanonicalJsonlAdapter();
    case "otlp": return new OtlpHttpJsonAdapter();
    case "codex": return new CodexSessionAdapter();
    case "claude": return new ClaudeSessionAdapter();
    default: throw new Error(`No built-in adapter for ${source}`);
  }
}

export const adapterManifests = (["jsonl", "otlp", "codex", "claude"] as const).map((source) => createAdapter(source).manifest);

const detectionOrder = ["jsonl", "otlp", "codex", "claude"] as const;

export async function detectSourceKind(input: AdapterInput): Promise<TraceSourceKind | null> {
  const normalized = normalizeAdapterInput(input);
  for (const source of detectionOrder) {
    if (await createAdapter(source).sniff(normalized)) return source;
  }
  return null;
}
