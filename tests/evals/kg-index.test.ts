import { describe, it, expect } from 'vitest';
import {
  getChildren,
  getComponents,
  getGradeConfig,
  getEdgesAmong,
  getLaneForNode,
  getNodeCount,
} from '../../src/data/knowledge-graph-v2/index';

describe('KG v2 Index', () => {
  it('loads all 406 nodes', () => {
    expect(getNodeCount()).toBe(406);
  });

  it('getChildren returns correct adjacency', () => {
    // K.CC.C.6 → K.CC.C.7 and K.MD.B.3
    const children = getChildren('59fef5e5-3828-5332-b762-bc0c91ca1fb8');
    expect(children).toContain('c984a883-a457-55db-9f87-b0358e5ac760');
    expect(children).toContain('75e75869-038b-56c4-a377-b13df275e992');
    expect(children).toHaveLength(2);
  });

  it('getComponents returns sub-skills', () => {
    // K.OA.A.3 has 6 learning components
    const comps = getComponents('b2e2c061-29b5-5946-be19-19e1a5e8e148');
    expect(comps).toHaveLength(6);
    expect(comps[0].standardId).toBe('b2e2c061-29b5-5946-be19-19e1a5e8e148');
  });

  it('getGradeConfig returns correct anchors per grade', () => {
    const g5 = getGradeConfig('5');
    expect(Object.keys(g5.anchors)).toHaveLength(4);

    const g8 = getGradeConfig('8');
    expect(Object.keys(g8.anchors)).toHaveLength(5);
    expect(g8.anchors).toHaveProperty('functions');
  });

  it('getEdgesAmong filters to visible subgraph', () => {
    // K.CC.C.6 → K.MD.B.3 is a buildsTowards edge
    const edges = getEdgesAmong([
      '59fef5e5-3828-5332-b762-bc0c91ca1fb8',
      '75e75869-038b-56c4-a377-b13df275e992',
    ]);
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe('buildsTowards');
  });

  it('getLaneForNode returns correct lane', () => {
    expect(getLaneForNode('59fef5e5-3828-5332-b762-bc0c91ca1fb8', 'K')).toBe('number');
  });
});
