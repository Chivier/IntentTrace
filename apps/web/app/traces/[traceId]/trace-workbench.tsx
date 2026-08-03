"use client";

import "@xyflow/react/dist/style.css";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";

interface RawEvent {
  id: string;
  ingestSeq: string;
  occurredAt: string;
  kind: string;
  name: string;
  status: string;
  agentId?: string;
  payloadRef?: { artifactId: string };
}
interface AgentLane {
  agentId: string;
  displayName: string;
  eventIds: string[];
  startedAt: string;
  endedAt: string;
  errorCount: number;
}
interface Claim {
  kind: string;
  text: string;
  provenance: string;
  confidence: string;
  evidenceEventIds: string[];
}
interface SemanticNode {
  id: string;
  logicalNodeId: string;
  title: string;
  kind: string;
  status: string;
  claims: Claim[];
  layout: { x: number; y: number } | null;
  pinnedByHuman: boolean;
}
interface SemanticEdge {
  logicalEdgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: string;
  retired: boolean;
}
interface Snapshot {
  trace: { id: string; title: string; status: string; latestIngestSeq: string };
  raw: { events: RawEvent[] };
  agents: AgentLane[];
  revision: { id: string; eventWatermark: string; branchKind: string; stale: boolean } | null;
}
interface Graph {
  revision: NonNullable<Snapshot["revision"]>;
  nodes: SemanticNode[];
  edges: SemanticEdge[];
}

export function TraceWorkbench({ traceId }: { traceId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [connection, setConnection] = useState("connecting");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [layoutPositions, setLayoutPositions] = useState<Record<string, { x: number; y: number }>>(
    {},
  );
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [snapshotResponse, graphResponse] = await Promise.all([
      fetch(`/api/v1/traces/${traceId}/snapshot?limit=1000`, { cache: "no-store" }),
      fetch(`/api/v1/traces/${traceId}/graph`, { cache: "no-store" }),
    ]);
    if (!snapshotResponse.ok) throw new Error(`snapshot ${snapshotResponse.status}`);
    const nextSnapshot = (await snapshotResponse.json()) as Snapshot;
    const nextGraph =
      graphResponse.status === 204
        ? null
        : graphResponse.ok
          ? ((await graphResponse.json()) as Graph)
          : null;
    setSnapshot(nextSnapshot);
    setGraph(nextGraph);
    setPlayhead((current) =>
      current === 0 ? Number(nextSnapshot.trace.latestIngestSeq) : current,
    );
  }, [traceId]);

  useEffect(() => {
    void refresh().catch((reason: unknown) =>
      setError(reason instanceof Error ? reason.message : String(reason)),
    );
  }, [refresh]);
  useEffect(() => {
    const events = new EventSource(`/api/v1/traces/${traceId}/stream`);
    events.onopen = () => setConnection("live");
    events.onmessage = () => void refresh();
    for (const type of ["raw_event.appended", "trace.completed", "semantic_revision.created"])
      events.addEventListener(type, () => void refresh());
    events.onerror = () => setConnection("reconnecting");
    return () => events.close();
  }, [refresh, traceId]);
  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return;
    const worker = new Worker(new URL("./layout-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (
      event: MessageEvent<Array<{ id: string; x: number; y: number }> | { error: string }>,
    ) => {
      if (!Array.isArray(event.data)) return;
      setLayoutPositions(
        Object.fromEntries(event.data.map((node) => [node.id, { x: node.x, y: node.y }])),
      );
    };
    worker.postMessage({
      nodes: graph.nodes.map((node) => ({
        id: node.logicalNodeId,
        ...(node.layout ? { pinnedPosition: node.layout } : {}),
        ...(layoutPositions[node.logicalNodeId]
          ? { previousPosition: layoutPositions[node.logicalNodeId], unchanged: true }
          : {}),
      })),
      edges: graph.edges
        .filter((edge) => !edge.retired)
        .map((edge) => ({
          id: edge.logicalEdgeId,
          source: edge.sourceNodeId,
          target: edge.targetNodeId,
        })),
    });
    return () => worker.terminate();
  }, [graph]);

  const raw = useMemo(
    () => (snapshot?.raw.events ?? []).filter((event) => Number(event.ingestSeq) <= playhead),
    [playhead, snapshot],
  );
  const eventById = useMemo(() => new Map(raw.map((event) => [event.id, event])), [raw]);
  const selectedNode = graph?.nodes.find((node) => node.logicalNodeId === selectedNodeId) ?? null;
  const selectedEvidence =
    selectedNode?.claims
      .flatMap((claim) => claim.evidenceEventIds)
      .map((id) => eventById.get(id))
      .filter((event): event is RawEvent => Boolean(event)) ?? [];
  const flowNodes: Node[] = (graph?.nodes ?? []).map((node, index) => ({
    id: node.logicalNodeId,
    position: node.layout ??
      layoutPositions[node.logicalNodeId] ?? {
        x: (index % 4) * 260,
        y: Math.floor(index / 4) * 150,
      },
    data: { label: `${node.kind.toUpperCase()} · ${node.title}` },
    className: `semantic-node semantic-node--${node.status}${node.pinnedByHuman ? " semantic-node--pinned" : ""}`,
  }));
  const flowEdges: Edge[] = (graph?.edges ?? [])
    .filter((edge) => !edge.retired)
    .map((edge) => ({
      id: edge.logicalEdgeId,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      label: edge.kind,
    }));
  const editSelectedNode = async (edit: { pinned?: boolean; feedback?: string }) => {
    if (!selectedNode || !graph) return;
    const response = await fetch(`/api/v1/traces/${traceId}/nodes/${selectedNode.logicalNodeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseRevisionId: graph.revision.id, ...edit }),
    });
    if (!response.ok) throw new Error(`human edit ${response.status}`);
    setGraph((await response.json()) as Graph);
    setFeedback("");
  };

  return (
    <main className="trace-workbench">
      <header className="trace-toolbar">
        <Link href="/traces">← Traces</Link>
        <div>
          <strong>{snapshot?.trace.title ?? "Loading trace…"}</strong>
          <small>{traceId}</small>
        </div>
        <span className={`connection connection--${connection}`}>{connection}</span>
        <span>{snapshot?.trace.status ?? "loading"}</span>
        <button
          className="inspector-toggle"
          type="button"
          onClick={() => setInspectorOpen((value) => !value)}
          aria-expanded={inspectorOpen}
        >
          Evidence
        </button>
      </header>
      {error ? (
        <p role="alert" className="error-panel">
          {error}
        </p>
      ) : null}
      <section className="replay-bar" aria-label="Replay controls">
        <label htmlFor="playhead">
          Known at ingest watermark <strong>{playhead}</strong>
        </label>
        <input
          id="playhead"
          type="range"
          min="0"
          max={Number(snapshot?.trace.latestIngestSeq ?? 0)}
          value={playhead}
          onChange={(event) => setPlayhead(Number(event.target.value))}
        />
        <button
          type="button"
          onClick={() => setPlayhead(Number(snapshot?.trace.latestIngestSeq ?? 0))}
        >
          Live
        </button>
      </section>
      <div className="workbench-grid">
        <section className="graph-panel" aria-label="Intent graph">
          <div className="panel-heading">
            <h2>Intent Graph</h2>
            <span>
              {graph?.revision
                ? `${graph.revision.branchKind} r${graph.revision.eventWatermark}${graph.revision.stale ? " · stale" : ""}`
                : "pending"}
            </span>
          </div>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            fitView
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              setInspectorOpen(true);
            }}
            nodesDraggable={false}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background />
            <MiniMap pannable zoomable />
            <Controls />
          </ReactFlow>
        </section>
        <section
          className={`evidence-panel${inspectorOpen ? " evidence-panel--open" : ""}`}
          aria-label="Evidence inspector"
        >
          <div className="panel-heading">
            <h2>Evidence</h2>
            <span>claim-level</span>
          </div>
          {selectedNode ? (
            <>
              <h3>{selectedNode.title}</h3>
              <div className="human-controls">
                <button
                  type="button"
                  onClick={() =>
                    void editSelectedNode({ pinned: !selectedNode.pinnedByHuman }).catch(
                      (reason: unknown) =>
                        setError(reason instanceof Error ? reason.message : String(reason)),
                    )
                  }
                >
                  {selectedNode.pinnedByHuman ? "Unpin" : "Pin human revision"}
                </button>
                <label htmlFor="node-feedback">Feedback</label>
                <textarea
                  id="node-feedback"
                  value={feedback}
                  maxLength={1000}
                  onChange={(event) => setFeedback(event.target.value)}
                />
                <button
                  type="button"
                  disabled={!feedback.trim()}
                  onClick={() =>
                    void editSelectedNode({ feedback: feedback.trim() }).catch((reason: unknown) =>
                      setError(reason instanceof Error ? reason.message : String(reason)),
                    )
                  }
                >
                  Save feedback
                </button>
              </div>
              {selectedNode.claims.map((claim, index) => (
                <article className="claim" key={`${claim.kind}-${index}`}>
                  <header>
                    <strong>{claim.kind}</strong>
                    <span>
                      {claim.confidence} · {claim.provenance}
                    </span>
                  </header>
                  <p>{claim.text}</p>
                  {claim.evidenceEventIds.map((id) => (
                    <button type="button" key={id} onClick={() => setSelectedEventId(id)}>
                      #{eventById.get(id)?.ingestSeq ?? "outside playhead"}{" "}
                      {eventById.get(id)?.name ?? id}
                    </button>
                  ))}
                </article>
              ))}
            </>
          ) : (
            <p className="muted">选择图节点查看确定性 reducer 接受的证据。</p>
          )}
          {selectedEvidence.length > 0 ? (
            <small>{selectedEvidence.length} evidence facts visible at this watermark</small>
          ) : null}
        </section>
        <section className="gantt-panel" aria-label="Agent Gantt">
          <div className="panel-heading">
            <h2>Agent Gantt</h2>
            <span>source time</span>
          </div>
          {(snapshot?.agents ?? []).map((lane) => (
            <div className="gantt-lane" key={lane.agentId}>
              <strong>{lane.displayName}</strong>
              <div>
                {lane.eventIds.map((id, index) => (
                  <button
                    type="button"
                    className={
                      selectedEventId === id ? "event-dot event-dot--selected" : "event-dot"
                    }
                    style={{
                      left: `${Math.max(2, (index / Math.max(1, lane.eventIds.length - 1)) * 94)}%`,
                    }}
                    key={id}
                    onClick={() => setSelectedEventId(id)}
                    aria-label={`Select event ${id}`}
                  />
                ))}
              </div>
              <span>{lane.errorCount ? `${lane.errorCount} errors` : "ok"}</span>
            </div>
          ))}
        </section>
        <section className="raw-panel" aria-label="Raw events">
          <div className="panel-heading">
            <h2>Raw Events</h2>
            <span>{raw.length} immutable facts</span>
          </div>
          <div className="raw-table" role="list">
            {raw.map((event) => (
              <button
                type="button"
                role="listitem"
                key={event.id}
                className={selectedEventId === event.id ? "raw-row raw-row--selected" : "raw-row"}
                onClick={() => setSelectedEventId(event.id)}
              >
                <code>#{event.ingestSeq}</code>
                <span>{event.kind}</span>
                <strong>{event.name}</strong>
                <small>{event.agentId ?? "system"}</small>
                <time>{new Date(event.occurredAt).toLocaleTimeString()}</time>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
