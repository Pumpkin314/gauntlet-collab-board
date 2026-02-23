import dagre from 'dagre';
import type { KGNode, KGEdge } from './index';

interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  rankDir?: 'TB' | 'BT' | 'LR' | 'RL';
  rankSep?: number;
  nodeSep?: number;
}

/**
 * Compute DAG layout positions for a set of knowledge graph nodes and edges.
 * Returns a Map from node ID to {x, y} canvas coordinates.
 */
export function layoutKnowledgeGraph(
  nodes: KGNode[],
  edges: KGEdge[],
  options: LayoutOptions = {},
): Map<string, { x: number; y: number }> {
  const {
    nodeWidth = 220,
    nodeHeight = 80,
    rankDir = 'TB',
    rankSep = 100,
    nodeSep = 60,
  } = options;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: rankDir, ranksep: rankSep, nodesep: nodeSep });
  g.setDefaultEdgeLabel(() => ({}));

  const nodeIds = new Set(nodes.map(n => n.id));

  for (const node of nodes) {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const dagreNode = g.node(node.id);
    if (dagreNode) {
      positions.set(node.id, {
        x: Math.round(dagreNode.x - nodeWidth / 2),
        y: Math.round(dagreNode.y - nodeHeight / 2),
      });
    }
  }

  return positions;
}
