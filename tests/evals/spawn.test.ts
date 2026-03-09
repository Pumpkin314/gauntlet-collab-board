import { describe, it, expect } from 'vitest';
import {
  computeAnchorPlacements,
  computeChildSpawnPlacements,
} from '../../src/agent/explorerSpawn';
import { getGradeConfig, getChildren } from '../../src/data/knowledge-graph-v2/index';

const VIEWPORT = { x: 500, y: 500 };
const VIEWPORT_WIDTH = 1000;

describe('computeAnchorPlacements', () => {
  it('returns correct lane count and vertical offset for buildsTowards pairs', () => {
    const placements = computeAnchorPlacements('5', VIEWPORT, VIEWPORT_WIDTH);
    expect(placements).toHaveLength(4);

    const config = getGradeConfig('5');
    if (config.buildsTowards.length === 0) return;

    const placementMap = new Map(placements.map(p => [p.kgNodeId, p]));
    for (const edge of config.buildsTowards) {
      const source = placementMap.get(edge.source);
      const target = placementMap.get(edge.target);
      if (source && target) {
        expect(source.y).toBeLessThan(target.y);
      }
    }
  });
});

describe('computeChildSpawnPlacements', () => {
  it('caps at maxSpawn and positions children above parent', () => {
    const config = getGradeConfig('5');
    const anchorId = Object.values(config.anchors)[0];
    const children = getChildren(anchorId);
    if (children.length === 0) return;

    const parentY = 500;
    const toPass = children.slice(0, 5);
    const result = computeChildSpawnPlacements(
      { x: 500, y: parentY },
      toPass,
      '5',
      VIEWPORT_WIDTH,
      3,
    );

    expect(result.placements.length).toBeLessThanOrEqual(3);
    expect(result.remaining).toBe(toPass.length - result.placements.length);
    for (const p of result.placements) {
      expect(p.y).toBeLessThan(parentY);
    }
  });
});
