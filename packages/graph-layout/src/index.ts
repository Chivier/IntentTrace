export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  pinnedPosition?: { x: number; y: number };
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

export function foundationLinearLayout(nodes: readonly LayoutNode[]): readonly PositionedNode[] {
  return nodes.map((node, index) => ({
    ...node,
    x: node.pinnedPosition?.x ?? 0,
    y: node.pinnedPosition?.y ?? index * 140,
  }));
}
