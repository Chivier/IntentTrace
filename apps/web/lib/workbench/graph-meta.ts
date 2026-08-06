import type { SemanticEdgeKind, SemanticNodeKind, SemanticNodeStatus } from "./types";

export interface NodeKindMeta {
  icon: string;
  label: string;
  tone: "accent" | "red" | "green" | "pink";
}

export const nodeKindMeta: Record<SemanticNodeKind, NodeKindMeta> = {
  request: { icon: "◎", label: "Request", tone: "accent" },
  goal: { icon: "◇", label: "Goal", tone: "accent" },
  work: { icon: "⌘", label: "Work", tone: "accent" },
  decision: { icon: "◆", label: "Decision", tone: "accent" },
  issue: { icon: "!", label: "Issue", tone: "red" },
  handoff: { icon: "⇄", label: "Handoff", tone: "pink" },
  result: { icon: "★", label: "Result", tone: "green" },
};

export interface NodeStatusMeta {
  label: string;
  pillClass: string;
}

export const nodeStatusMeta: Record<SemanticNodeStatus, NodeStatusMeta> = {
  proposed: { label: "proposed", pillClass: "border-line text-muted-2" },
  active: { label: "active", pillClass: "border-accent/25 bg-accent/7 text-[#c6bfff]" },
  blocked: { label: "blocked", pillClass: "border-red/25 bg-red/7 text-[#ffabab]" },
  completed: { label: "completed", pillClass: "border-green/25 bg-green/7 text-[#8ce7af]" },
  abandoned: { label: "abandoned", pillClass: "border-line text-muted-2 line-through" },
  superseded: { label: "superseded", pillClass: "border-line text-muted-2" },
};

export interface EdgeKindMeta {
  color: string;
  dash: string;
}

export const edgeKindMeta: Record<SemanticEdgeKind, EdgeKindMeta> = {
  decomposes_to: { color: "#3b4658", dash: "7 7" },
  attempts: { color: "#3b4658", dash: "7 7" },
  depends_on: { color: "#3b4658", dash: "7 7" },
  supports: { color: "var(--color-cyan)", dash: "7 7" },
  blocks: { color: "var(--color-red)", dash: "7 7" },
  resolved_by: { color: "var(--color-red)", dash: "7 7" },
  hands_off_to: { color: "var(--color-pink)", dash: "3 8" },
  revises: { color: "var(--color-amber)", dash: "7 7" },
  produces: { color: "var(--color-green)", dash: "7 7" },
  supersedes: { color: "var(--color-amber)", dash: "3 8" },
};
