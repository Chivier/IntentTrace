/// <reference lib="webworker" />

import { ElkIncrementalLayout } from "@intenttrace/graph-layout";

interface LayoutMessage {
  nodes: Array<{
    id: string;
    pinnedPosition?: { x: number; y: number };
    previousPosition?: { x: number; y: number };
    unchanged?: boolean;
  }>;
  edges: Array<{ id: string; source: string; target: string }>;
}

const engine = new ElkIncrementalLayout();
self.onmessage = (event: MessageEvent<LayoutMessage>) => {
  void engine
    .layout(
      event.data.nodes.map((node) => ({ ...node, width: 220, height: 72 })),
      event.data.edges,
    )
    .then((nodes) => self.postMessage(nodes.map((node) => ({ id: node.id, x: node.x, y: node.y }))))
    .catch((error: unknown) =>
      self.postMessage({ error: error instanceof Error ? error.message : String(error) }),
    );
};
