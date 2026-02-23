import { describe, it, expect } from 'vitest';
import {
  getNode,
  getPrerequisites,
  getDependents,
  getNodesByGrade,
  getRoots,
  getFrontier,
  getSubgraph,
  searchNodes,
  getAllNodes,
  getAllEdges,
} from '../index';

describe('Knowledge Graph API', () => {
  it('loads all nodes', () => {
    const nodes = getAllNodes();
    expect(nodes.length).toBe(836);
    expect(nodes[0]).toHaveProperty('id');
    expect(nodes[0]).toHaveProperty('description');
    expect(nodes[0]).toHaveProperty('gradeLevel');
  });

  it('loads all edges', () => {
    const edges = getAllEdges();
    expect(edges.length).toBe(757);
    expect(edges[0]).toHaveProperty('source');
    expect(edges[0]).toHaveProperty('target');
  });

  it('getNode returns a node by ID', () => {
    const nodes = getAllNodes();
    const first = nodes[0]!;
    const found = getNode(first.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(first.id);
  });

  it('getNode returns undefined for unknown ID', () => {
    expect(getNode('nonexistent-id')).toBeUndefined();
  });

  it('getPrerequisites returns parent nodes', () => {
    const edges = getAllEdges();
    const edgeWithTarget = edges[0]!;
    const prereqs = getPrerequisites(edgeWithTarget.target);
    expect(prereqs.length).toBeGreaterThanOrEqual(1);
    expect(prereqs.some(p => p.id === edgeWithTarget.source)).toBe(true);
  });

  it('getDependents returns child nodes', () => {
    const edges = getAllEdges();
    const edgeWithSource = edges[0]!;
    const deps = getDependents(edgeWithSource.source);
    expect(deps.length).toBeGreaterThanOrEqual(1);
    expect(deps.some(d => d.id === edgeWithSource.target)).toBe(true);
  });

  it('getNodesByGrade returns nodes for a grade', () => {
    const grade5 = getNodesByGrade('5');
    expect(grade5.length).toBeGreaterThan(0);
    expect(grade5.every(n => n.gradeLevel.includes('5'))).toBe(true);
  });

  it('getRoots returns nodes with no prerequisites', () => {
    const roots = getRoots();
    expect(roots.length).toBeGreaterThan(0);
    for (const root of roots) {
      const prereqs = getPrerequisites(root.id);
      expect(prereqs.length).toBe(0);
    }
  });

  it('getFrontier with empty mastery returns roots', () => {
    const frontier = getFrontier(new Set());
    const roots = getRoots();
    // Frontier should include all roots (no prereqs, not mastered)
    for (const root of roots) {
      expect(frontier.some(f => f.id === root.id)).toBe(true);
    }
  });

  it('getFrontier excludes mastered nodes', () => {
    const roots = getRoots();
    const masteredId = roots[0]!.id;
    const frontier = getFrontier(new Set([masteredId]));
    expect(frontier.every(f => f.id !== masteredId)).toBe(true);
  });

  it('getFrontier includes children of mastered nodes', () => {
    const roots = getRoots();
    const masteredId = roots[0]!.id;
    const deps = getDependents(masteredId);
    if (deps.length > 0) {
      const mastered = new Set([masteredId]);
      const frontier = getFrontier(mastered);
      // Deps whose ALL prereqs are in mastered set should appear in frontier
      for (const dep of deps) {
        const allPrereqsMastered = getPrerequisites(dep.id).every(p => mastered.has(p.id));
        if (allPrereqsMastered) {
          expect(frontier.some(f => f.id === dep.id)).toBe(true);
        }
      }
    }
  });

  it('getSubgraph returns correct neighborhood', () => {
    const edges = getAllEdges();
    const centerId = edges[0]!.source;
    const sub = getSubgraph([centerId], 1);
    expect(sub.nodes.length).toBeGreaterThanOrEqual(1);
    expect(sub.nodes.some(n => n.id === centerId)).toBe(true);
    // All edges should connect nodes in the subgraph
    const nodeIds = new Set(sub.nodes.map(n => n.id));
    for (const e of sub.edges) {
      expect(nodeIds.has(e.source)).toBe(true);
      expect(nodeIds.has(e.target)).toBe(true);
    }
  });

  it('searchNodes finds by description', () => {
    const results = searchNodes('fraction');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.description.toLowerCase().includes('fraction'))).toBe(true);
  });

  it('searchNodes respects limit', () => {
    const results = searchNodes('the', 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('searchNodes returns empty for nonsense query', () => {
    const results = searchNodes('xyzzyplugh123');
    expect(results.length).toBe(0);
  });
});
