import { describe, it, expect } from 'vitest';
import {
  getNode,
  getChildren,
  getParents,
  getRelated,
  getComponents,
  getGradeConfig,
  getEdgesAmong,
  getLaneForNode,
  getAllGrades,
  getNodeCount,
} from '../../src/data/knowledge-graph-v2/index';

describe('KG v2 Index', () => {
  it('loads all 406 nodes', () => {
    expect(getNodeCount()).toBe(406);
  });

  it('getChildren returns correct children for K.CC.C.6', () => {
    const children = getChildren('59fef5e5-3828-5332-b762-bc0c91ca1fb8');
    expect(children).toContain('c984a883-a457-55db-9f87-b0358e5ac760');
    expect(children).toContain('75e75869-038b-56c4-a377-b13df275e992');
    expect(children).toHaveLength(2);
  });

  it('getParents returns correct parents for K.CC.C.7', () => {
    const parents = getParents('c984a883-a457-55db-9f87-b0358e5ac760');
    expect(parents).toContain('59fef5e5-3828-5332-b762-bc0c91ca1fb8');
  });

  it('getComponents returns sub-skills for K.OA.A.3', () => {
    const comps = getComponents('b2e2c061-29b5-5946-be19-19e1a5e8e148');
    expect(comps).toHaveLength(6);
    for (const c of comps) {
      expect(c.standardId).toBe('b2e2c061-29b5-5946-be19-19e1a5e8e148');
      expect(c.id).toBeTruthy();
      expect(c.description).toBeTruthy();
    }
  });

  it('getGradeConfig("5") returns 4 anchors', () => {
    const config = getGradeConfig('5');
    expect(config).toBeDefined();
    const anchorKeys = Object.keys(config.anchors);
    expect(anchorKeys).toHaveLength(4);
    expect(anchorKeys).toEqual(
      expect.arrayContaining(['number', 'algebra', 'data', 'geometry']),
    );
  });

  it('getGradeConfig("8") returns 5 anchors', () => {
    const config = getGradeConfig('8');
    expect(config).toBeDefined();
    const anchorKeys = Object.keys(config.anchors);
    expect(anchorKeys).toHaveLength(5);
    expect(anchorKeys).toEqual(
      expect.arrayContaining([
        'number',
        'algebra',
        'functions',
        'data',
        'geometry',
      ]),
    );
  });

  it('getEdgesAmong with connected pair returns edge', () => {
    const edges = getEdgesAmong([
      '59fef5e5-3828-5332-b762-bc0c91ca1fb8',
      '75e75869-038b-56c4-a377-b13df275e992',
    ]);
    expect(edges.length).toBeGreaterThanOrEqual(1);
    expect(edges[0].source).toBe('59fef5e5-3828-5332-b762-bc0c91ca1fb8');
    expect(edges[0].target).toBe('75e75869-038b-56c4-a377-b13df275e992');
  });

  it('getEdgesAmong with unconnected pair returns empty', () => {
    const edges = getEdgesAmong([
      '59fef5e5-3828-5332-b762-bc0c91ca1fb8',
      '308440b4-e522-5061-85a6-4a5a0a3dce51',
    ]);
    expect(edges).toHaveLength(0);
  });

  it('getLaneForNode returns correct lane', () => {
    const lane = getLaneForNode(
      '59fef5e5-3828-5332-b762-bc0c91ca1fb8',
      'K',
    );
    expect(lane).toBe('number');
  });

  it('getAllGrades returns expected grades', () => {
    const grades = getAllGrades();
    expect(grades).toEqual(
      expect.arrayContaining([
        'K', '1', '2', '3', '4', '5', '6', '7', '8', 'HS',
      ]),
    );
    expect(grades).toHaveLength(10);
  });
});
