import type { ELK, ElkNode } from "elkjs";
import ElkModule from "elkjs/lib/elk.bundled.js";

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  pinnedPosition?: { x: number; y: number };
  previousPosition?: { x: number; y: number };
  unchanged?: boolean;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
}

export interface PositionedNode extends LayoutNode {
  x: number;
  y: number;
}

export interface GraphLayoutEngine {
  layout(
    nodes: readonly LayoutNode[],
    edges: readonly LayoutEdge[],
  ): Promise<readonly PositionedNode[]>;
}

export class ElkIncrementalLayout implements GraphLayoutEngine {
  private readonly elk: ELK = new (ElkModule as unknown as { new (): ELK })();

  async layout(
    nodes: readonly LayoutNode[],
    edges: readonly LayoutEdge[],
  ): Promise<readonly PositionedNode[]> {
    if (nodes.length === 0) return [];
    const graph = await this.elk.layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "44",
        "elk.layered.spacing.nodeNodeBetweenLayers": "72",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      },
      children: nodes.map((node) => ({ id: node.id, width: node.width, height: node.height })),
      edges: edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
    });
    const positions = new Map<string, { x: number; y: number }>(
      (graph.children ?? []).map(
        (node: ElkNode) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }] as const,
      ),
    );
    return nodes.map((node) => {
      const computed = positions.get(node.id) ?? { x: 0, y: 0 };
      const stable =
        node.pinnedPosition ?? (node.unchanged ? node.previousPosition : undefined) ?? computed;
      return { ...node, x: stable.x, y: stable.y };
    });
  }
}

export function foundationLinearLayout(nodes: readonly LayoutNode[]): readonly PositionedNode[] {
  return nodes.map((node, index) => ({
    ...node,
    x: node.pinnedPosition?.x ?? 0,
    y: node.pinnedPosition?.y ?? index * 140,
  }));
}
