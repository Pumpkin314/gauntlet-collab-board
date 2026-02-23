import nodesData from './cc-math-nodes.json';
import edgesData from './cc-math-edges.json';

export interface KGNode {
  id: string;
  code?: string;
  description: string;
  gradeLevel: string[];
  type: 'standard' | 'grouping';
}

export interface KGEdge {
  source: string;
  target: string;
}

const nodes: KGNode[] = nodesData as KGNode[];
const edges: KGEdge[] = edgesData as KGEdge[];

const nodeMap = new Map<string, KGNode>();
const childrenMap = new Map<string, string[]>();
const parentsMap = new Map<string, string[]>();
const gradeIndex = new Map<string, string[]>();

for (const node of nodes) {
  nodeMap.set(node.id, node);
  for (const grade of node.gradeLevel) {
    const list = gradeIndex.get(grade) ?? [];
    list.push(node.id);
    gradeIndex.set(grade, list);
  }
}

for (const edge of edges) {
  const children = childrenMap.get(edge.source) ?? [];
  children.push(edge.target);
  childrenMap.set(edge.source, children);

  const parents = parentsMap.get(edge.target) ?? [];
  parents.push(edge.source);
  parentsMap.set(edge.target, parents);
}

export function getNode(id: string): KGNode | undefined {
  return nodeMap.get(id);
}

export function getPrerequisites(id: string): KGNode[] {
  const parentIds = parentsMap.get(id) ?? [];
  return parentIds.map(pid => nodeMap.get(pid)).filter((n): n is KGNode => !!n);
}

export function getDependents(id: string): KGNode[] {
  const childIds = childrenMap.get(id) ?? [];
  return childIds.map(cid => nodeMap.get(cid)).filter((n): n is KGNode => !!n);
}

export function getNodesByGrade(grade: string): KGNode[] {
  const ids = gradeIndex.get(grade) ?? [];
  return ids.map(id => nodeMap.get(id)).filter((n): n is KGNode => !!n);
}

export function getRoots(): KGNode[] {
  return nodes.filter(n => !parentsMap.has(n.id) || parentsMap.get(n.id)!.length === 0);
}

/**
 * Compute the learning frontier: nodes whose ALL prerequisites are mastered
 * but the node itself is not yet mastered.
 */
export function getFrontier(masteredIds: Set<string>): KGNode[] {
  return nodes.filter(node => {
    if (masteredIds.has(node.id)) return false;
    const prereqs = parentsMap.get(node.id) ?? [];
    if (prereqs.length === 0) return !masteredIds.has(node.id);
    return prereqs.every(pid => masteredIds.has(pid));
  });
}

/**
 * Get a subgraph: the node plus its N-depth neighborhood.
 */
export function getSubgraph(
  centerIds: string[],
  depth = 1,
): { nodes: KGNode[]; edges: KGEdge[] } {
  const visited = new Set<string>();
  const queue: Array<{ id: string; d: number }> = [];

  for (const id of centerIds) {
    if (nodeMap.has(id)) {
      queue.push({ id, d: 0 });
      visited.add(id);
    }
  }

  while (queue.length > 0) {
    const { id, d } = queue.shift()!;
    if (d >= depth) continue;

    const neighbors = [
      ...(childrenMap.get(id) ?? []),
      ...(parentsMap.get(id) ?? []),
    ];
    for (const nid of neighbors) {
      if (!visited.has(nid) && nodeMap.has(nid)) {
        visited.add(nid);
        queue.push({ id: nid, d: d + 1 });
      }
    }
  }

  const subNodes = [...visited].map(id => nodeMap.get(id)!);
  const subEdges = edges.filter(e => visited.has(e.source) && visited.has(e.target));
  return { nodes: subNodes, edges: subEdges };
}

/**
 * Search nodes by tokenized word matching with relevance scoring.
 * Each query word is matched independently; nodes are ranked by how
 * many words they match (ties broken by exact-substring match).
 */
export function searchNodes(query: string, limit = 20): KGNode[] {
  const q = query.toLowerCase();
  const words = q.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return [];

  const scored: Array<{ node: KGNode; score: number }> = [];
  for (const node of nodes) {
    if (node.type === 'grouping') continue;
    const desc = node.description.toLowerCase();
    const code = node.code?.toLowerCase() ?? '';
    const text = desc + ' ' + code;

    let score = 0;
    for (const word of words) {
      if (text.includes(word)) score += 1;
    }
    // Bonus for exact full-query substring match
    if (text.includes(q)) score += 2;

    if (score > 0) scored.push({ node, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.node);
}

export function getAllNodes(): KGNode[] {
  return nodes;
}

export function getAllEdges(): KGEdge[] {
  return edges;
}
