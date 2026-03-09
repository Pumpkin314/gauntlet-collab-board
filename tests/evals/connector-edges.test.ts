/**
 * Connector / Edge Eval Set — North Star for Debug Sprint
 *
 * Tests the edge-drawing and spawn+connect pipeline in useExplorerStateMachine.
 * Each test defines EXPECTED behavior; failing tests identify bugs to fix.
 *
 * Scenarios covered:
 *   gs-030: Anchor spawn draws edges between KG-connected anchors
 *   gs-031: SPAWN_CHILDREN places children relative to parent (not viewport center)
 *   gs-032: SPAWN_CHILDREN draws edges from parent to new children
 *   gs-033: SPAWN_CHILDREN draws cross-edges between new children and existing visible nodes
 *   gs-034: SPAWN_PREREQS places prereqs relative to child node (not viewport center)
 *   gs-035: SPAWN_PREREQS draws edges from prereqs to child
 *   gs-036: "All children on board" still draws missing edges among existing nodes
 *   gs-037: Edge dedup — same edge not drawn twice
 *   gs-038: Connector endpoints are on node boundaries (not at 0,0)
 *   gs-039: Spawned children then prereqs of a child — both edge sets drawn, no duplicates
 *   gs-040: getObjectById timing — edges draw correctly for just-created objects
 */

import { describe, it, expect } from 'vitest';
import {
  getNode,
  getChildren,
  getParents,
  getEdgesAmong,
  getGradeConfig,
} from '../../src/data/knowledge-graph-v2/index';
import {
  computeAnchorPlacements,
  computeChildSpawnPlacements,
  computePrereqSpawnPlacements,
} from '../../src/agent/explorerSpawn';
import { resolveEndpoint } from '../../src/utils/anchorResolve';
import type { BoardObject } from '../../src/types/board';

// ── Helpers ──────────────────────────────────────────────────────────────────

const KG_NODE_WIDTH = 220;
const KG_NODE_HEIGHT = 80;

interface MockBoardObject {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kgNodeId?: string;
  fromId?: string;
  toId?: string;
  points?: number[];
  arrowEnd?: boolean;
}

/**
 * Simulates the board state and actions used by useExplorerStateMachine.
 * Tracks all created objects and provides getObjectById that returns
 * objects immediately (simulating what SHOULD happen after fixing the timing bug).
 */
function makeBoardSimulator() {
  const objects = new Map<string, MockBoardObject>();
  const created: MockBoardObject[] = [];
  let nextId = 1;

  return {
    createObject(type: string, x: number, y: number, overrides?: Partial<MockBoardObject>): string {
      const id = `obj-${nextId++}`;
      const obj: MockBoardObject = { id, type, x, y, width: 0, height: 0, ...overrides };
      if (type === 'kg-node') {
        obj.width = KG_NODE_WIDTH;
        obj.height = KG_NODE_HEIGHT;
      }
      objects.set(id, obj);
      created.push(obj);
      return id;
    },
    getObjectById(id: string): MockBoardObject | undefined {
      return objects.get(id);
    },
    updateObject(id: string, updates: Partial<MockBoardObject>) {
      const obj = objects.get(id);
      if (obj) Object.assign(obj, updates);
    },
    addExisting(obj: MockBoardObject) {
      objects.set(obj.id, obj);
    },
    get created() { return created; },
    get createdNodes() { return created.filter(o => o.type === 'kg-node'); },
    get createdLines() { return created.filter(o => o.type === 'line'); },
  };
}

/**
 * Simulates drawEdgesForVisibleNodes: given a kgNodeMap and board state,
 * draws edges for all visible KG nodes that have buildsTowards relationships.
 * This is the EXPECTED behavior — what the code SHOULD do.
 */
function drawEdgesForVisibleNodes(
  kgNodeMap: Map<string, string>,
  drawnEdges: Set<string>,
  board: ReturnType<typeof makeBoardSimulator>,
) {
  const allVisibleKgIds = [...kgNodeMap.keys()];
  const edges = getEdgesAmong(allVisibleKgIds);
  const newEdges: MockBoardObject[] = [];

  for (const edge of edges) {
    const edgeKey = `${edge.source}->${edge.target}`;
    if (drawnEdges.has(edgeKey)) continue;

    const fromBoardId = kgNodeMap.get(edge.source);
    const toBoardId = kgNodeMap.get(edge.target);
    if (!fromBoardId || !toBoardId) continue;

    const fromObj = board.getObjectById(fromBoardId);
    const toObj = board.getObjectById(toBoardId);
    if (!fromObj || !toObj) continue;

    const fromCenter = { x: fromObj.x + fromObj.width / 2, y: fromObj.y + fromObj.height / 2 };
    const toCenter = { x: toObj.x + toObj.width / 2, y: toObj.y + toObj.height / 2 };
    const toPt = resolveEndpoint(toObj as any, undefined, fromCenter);
    const fromPt = resolveEndpoint(fromObj as any, undefined, toPt);

    const lineId = board.createObject('line', fromPt.x, fromPt.y, {
      points: [fromPt.x, fromPt.y, toPt.x, toPt.y],
      fromId: fromBoardId,
      toId: toBoardId,
      arrowEnd: true,
    });
    drawnEdges.add(edgeKey);
    newEdges.push(board.getObjectById(lineId)!);
  }
  return newEdges;
}

/**
 * Simulates spawnPlacementsToBoard: places KG nodes on the board,
 * skipping any already in kgNodeMap.
 */
function spawnPlacementsToBoard(
  placements: Array<{ kgNodeId: string; x: number; y: number; description: string; laneColor: string }>,
  grade: string,
  kgNodeMap: Map<string, string>,
  board: ReturnType<typeof makeBoardSimulator>,
): string[] {
  const newKgIds: string[] = [];
  for (const p of placements) {
    if (kgNodeMap.has(p.kgNodeId)) continue;
    const boardId = board.createObject('kg-node', p.x, p.y, {
      kgNodeId: p.kgNodeId,
    });
    kgNodeMap.set(p.kgNodeId, boardId);
    newKgIds.push(p.kgNodeId);
  }
  return newKgIds;
}

// ── Find a grade with known anchor edges for deterministic testing ────────

/**
 * Find a grade whose anchors have at least one buildsTowards edge between them.
 * Note: config.buildsTowards lists ALL intra-grade edges, not just anchor-to-anchor.
 * We must check getEdgesAmong(anchorIds) to find actual anchor edges.
 */
function findGradeWithAnchorEdges(): { grade: string; config: ReturnType<typeof getGradeConfig> } {
  for (const g of ['3', '6', '7', '4', '5']) {
    const config = getGradeConfig(g);
    if (!config) continue;
    const anchorIds = Object.values(config.anchors).filter(Boolean) as string[];
    const edges = getEdgesAmong(anchorIds);
    if (edges.length > 0) return { grade: g, config };
  }
  throw new Error('No grade with anchor-to-anchor edges found');
}

/** Find a node with at least 1 child AND both in KG. */
function findNodeWithChildren(): { parentId: string; childIds: string[] } {
  const { grade, config } = findGradeWithAnchorEdges();
  for (const lane of config.laneOrder) {
    const anchorId = config.anchors[lane];
    if (!anchorId) continue;
    const children = getChildren(anchorId);
    if (children.length > 0) return { parentId: anchorId, childIds: children };
  }
  throw new Error('No anchor with children found');
}

/** Find a node with at least 1 parent AND both in KG. */
function findNodeWithParents(): { childId: string; parentIds: string[] } {
  const { grade, config } = findGradeWithAnchorEdges();
  for (const lane of config.laneOrder) {
    const anchorId = config.anchors[lane];
    if (!anchorId) continue;
    const parents = getParents(anchorId);
    if (parents.length > 0) return { childId: anchorId, parentIds: parents };
  }
  // Fall back: find any node with parents
  const { parentId, childIds } = findNodeWithChildren();
  for (const childId of childIds) {
    const parents = getParents(childId);
    if (parents.length > 0) return { childId, parentIds: parents };
  }
  throw new Error('No node with parents found');
}

// ── gs-030: Anchor spawn draws edges ─────────────────────────────────────────

describe('Anchor spawn edge drawing (gs-030)', () => {
  it('[gs-030a] edges are drawn between anchors that have KG buildsTowards relationships', () => {
    const { grade, config } = findGradeWithAnchorEdges();
    const viewportCenter = { x: 500, y: 400 };
    const viewportWidth = 1200;

    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    // Spawn anchors
    const placements = computeAnchorPlacements(grade, viewportCenter, viewportWidth);
    spawnPlacementsToBoard(placements, grade, kgNodeMap, board);

    // Draw edges
    const newEdges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    // Must have at least the number of buildsTowards edges in the config
    // (only among placed anchors)
    const placedKgIds = [...kgNodeMap.keys()];
    const expectedEdges = getEdgesAmong(placedKgIds);
    expect(newEdges.length).toBe(expectedEdges.length);
    expect(newEdges.length).toBeGreaterThan(0);
  });

  it('[gs-030b] each drawn edge has correct fromId/toId referencing board object IDs', () => {
    const { grade } = findGradeWithAnchorEdges();
    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    const placements = computeAnchorPlacements(grade, { x: 500, y: 400 }, 1200);
    spawnPlacementsToBoard(placements, grade, kgNodeMap, board);
    const newEdges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    for (const edge of newEdges) {
      expect(edge.fromId).toBeDefined();
      expect(edge.toId).toBeDefined();
      // fromId and toId must be valid board object IDs (not KG node IDs)
      expect(board.getObjectById(edge.fromId!)).toBeDefined();
      expect(board.getObjectById(edge.toId!)).toBeDefined();
      // The referenced objects must be kg-nodes
      expect(board.getObjectById(edge.fromId!)!.type).toBe('kg-node');
      expect(board.getObjectById(edge.toId!)!.type).toBe('kg-node');
    }
  });

  it('[gs-030c] drawnEdges set is populated and prevents re-drawing', () => {
    const { grade } = findGradeWithAnchorEdges();
    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    const placements = computeAnchorPlacements(grade, { x: 500, y: 400 }, 1200);
    spawnPlacementsToBoard(placements, grade, kgNodeMap, board);

    const firstBatch = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);
    const secondBatch = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    expect(firstBatch.length).toBeGreaterThan(0);
    expect(secondBatch.length).toBe(0);
  });
});

// ── gs-031: SPAWN_CHILDREN positions relative to parent ──────────────────────

describe('SPAWN_CHILDREN positioning (gs-031)', () => {
  it('[gs-031a] children are placed relative to parent position, not viewport center', () => {
    const { parentId, childIds } = findNodeWithChildren();
    const parentX = 300;
    const parentY = 500;
    const parentPos = { x: parentX, y: parentY };
    const viewportWidth = 1200;

    const unplacedChildren = childIds.filter(id => getNode(id));
    if (unplacedChildren.length === 0) return;

    const { placements } = computeChildSpawnPlacements(parentPos, unplacedChildren, '5', viewportWidth);

    // All children should be at y = parentY - 200 (CHILD_Y_OFFSET)
    for (const p of placements) {
      expect(p.y).toBe(parentY - 200);
    }
  });

  it('[gs-031b] children x-positions are spread around the parent x-position', () => {
    const { parentId, childIds } = findNodeWithChildren();
    const parentX = 400;
    const parentPos = { x: parentX, y: 500 };
    const viewportWidth = 1200;

    const unplacedChildren = childIds.filter(id => getNode(id)).slice(0, 3);
    if (unplacedChildren.length === 0) return;

    const { placements } = computeChildSpawnPlacements(parentPos, unplacedChildren, '5', viewportWidth);

    if (placements.length === 1) {
      // Single child centered on parent x
      expect(placements[0].x).toBe(parentX);
    } else {
      // Multiple children: average x should be near parent x
      const avgX = placements.reduce((sum, p) => sum + p.x, 0) / placements.length;
      expect(Math.abs(avgX - parentX)).toBeLessThan(200);
    }
  });

  it('[gs-031c] max 3 children spawned, remaining count returned', () => {
    const { parentId, childIds } = findNodeWithChildren();
    if (childIds.length <= 3) return; // Skip if not enough children

    const { placements, remaining } = computeChildSpawnPlacements(
      { x: 400, y: 500 }, childIds, '5', 1200,
    );

    expect(placements.length).toBe(3);
    expect(remaining).toBe(childIds.length - 3);
  });
});

// ── gs-032: SPAWN_CHILDREN draws parent→child edges ──────────────────────────

describe('SPAWN_CHILDREN edge drawing (gs-032)', () => {
  it('[gs-032a] edges are drawn from parent to each new child', () => {
    const { parentId, childIds } = findNodeWithChildren();
    const parentX = 400;
    const parentY = 500;

    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    // Place parent on board first
    const parentBoardId = board.createObject('kg-node', parentX, parentY, {
      kgNodeId: parentId,
    });
    kgNodeMap.set(parentId, parentBoardId);

    // Place children
    const unplacedChildren = childIds.filter(id => getNode(id)).slice(0, 3);
    const { placements } = computeChildSpawnPlacements(
      { x: parentX, y: parentY }, unplacedChildren, '5', 1200,
    );
    spawnPlacementsToBoard(placements, '5', kgNodeMap, board);

    // Draw edges
    const newEdges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    // There should be at least one edge from parent to a child
    const parentToChildEdges = newEdges.filter(e => e.fromId === parentBoardId);

    // Check: for each child that has a KG edge from parent, an edge should exist
    const expectedChildEdges = getEdgesAmong([parentId, ...unplacedChildren])
      .filter(e => e.source === parentId);

    for (const kgEdge of expectedChildEdges) {
      const childBoardId = kgNodeMap.get(kgEdge.target);
      if (!childBoardId) continue;
      const boardEdge = newEdges.find(
        e => e.fromId === parentBoardId && e.toId === childBoardId,
      );
      expect(boardEdge).toBeDefined();
    }
  });

  it('[gs-032b] edges have valid points arrays with non-zero coordinates', () => {
    const { parentId, childIds } = findNodeWithChildren();
    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    const parentBoardId = board.createObject('kg-node', 400, 500, { kgNodeId: parentId });
    kgNodeMap.set(parentId, parentBoardId);

    const unplacedChildren = childIds.filter(id => getNode(id)).slice(0, 3);
    const { placements } = computeChildSpawnPlacements(
      { x: 400, y: 500 }, unplacedChildren, '5', 1200,
    );
    spawnPlacementsToBoard(placements, '5', kgNodeMap, board);
    const newEdges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    for (const edge of newEdges) {
      expect(edge.points).toBeDefined();
      expect(edge.points!.length).toBe(4);
      // No point should be at (0,0) — that indicates the endpoint resolution failed
      const [fx, fy, tx, ty] = edge.points!;
      expect(Math.abs(fx) + Math.abs(fy)).toBeGreaterThan(0);
      expect(Math.abs(tx) + Math.abs(ty)).toBeGreaterThan(0);
    }
  });
});

// ── gs-033: Cross-edges between new children and existing visible nodes ──────

describe('Cross-edges between new and existing nodes (gs-033)', () => {
  it('[gs-033a] when a new child has a KG edge to an existing visible node, the edge is drawn', () => {
    const { parentId, childIds } = findNodeWithChildren();
    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    // Place parent
    const parentBoardId = board.createObject('kg-node', 400, 500, { kgNodeId: parentId });
    kgNodeMap.set(parentId, parentBoardId);

    // Find a child that also connects to another anchor
    const unplacedChildren = childIds.filter(id => getNode(id)).slice(0, 3);

    // Place an additional "existing" node that might share an edge with a child
    // Find any node that connects to one of the children
    let extraNodeId: string | null = null;
    for (const childId of unplacedChildren) {
      const childParents = getParents(childId);
      for (const p of childParents) {
        if (p !== parentId && getNode(p)) {
          extraNodeId = p;
          break;
        }
      }
      if (extraNodeId) break;
    }

    if (!extraNodeId) return; // Skip if no cross-edge scenario exists

    const extraBoardId = board.createObject('kg-node', 700, 500, { kgNodeId: extraNodeId });
    kgNodeMap.set(extraNodeId, extraBoardId);

    // Spawn children
    const { placements } = computeChildSpawnPlacements(
      { x: 400, y: 500 }, unplacedChildren, '5', 1200,
    );
    spawnPlacementsToBoard(placements, '5', kgNodeMap, board);

    // Draw edges — should include cross-edges
    const newEdges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    // Verify: edges should exist between the extra node and any children it connects to
    const allVisibleIds = [...kgNodeMap.keys()];
    const allExpectedEdges = getEdgesAmong(allVisibleIds);

    for (const kgEdge of allExpectedEdges) {
      const fromBoardId = kgNodeMap.get(kgEdge.source);
      const toBoardId = kgNodeMap.get(kgEdge.target);
      if (!fromBoardId || !toBoardId) continue;

      const boardEdge = newEdges.find(
        e => e.fromId === fromBoardId && e.toId === toBoardId,
      );
      expect(boardEdge).toBeDefined();
    }
  });
});

// ── gs-034: SPAWN_PREREQS positioning ────────────────────────────────────────

describe('SPAWN_PREREQS positioning (gs-034)', () => {
  it('[gs-034a] prereqs are placed relative to child position, not viewport center', () => {
    const { childId, parentIds } = findNodeWithParents();
    const childX = 600;
    const childY = 300;
    const childPos = { x: childX, y: childY };

    const unplacedPrereqs = parentIds.filter(id => getNode(id)).slice(0, 3);
    if (unplacedPrereqs.length === 0) return;

    const { placements } = computePrereqSpawnPlacements(childPos, unplacedPrereqs, '5', 1200);

    // All prereqs should be at y = childY + 200 (PREREQ_Y_OFFSET)
    for (const p of placements) {
      expect(p.y).toBe(childY + 200);
    }
  });

  it('[gs-034b] prereqs x-positions are spread around the child x-position', () => {
    const { childId, parentIds } = findNodeWithParents();
    const childX = 600;
    const childPos = { x: childX, y: 300 };

    const unplacedPrereqs = parentIds.filter(id => getNode(id)).slice(0, 3);
    if (unplacedPrereqs.length === 0) return;

    const { placements } = computePrereqSpawnPlacements(childPos, unplacedPrereqs, '5', 1200);

    if (placements.length === 1) {
      expect(placements[0].x).toBe(childX);
    } else {
      const avgX = placements.reduce((sum, p) => sum + p.x, 0) / placements.length;
      expect(Math.abs(avgX - childX)).toBeLessThan(200);
    }
  });
});

// ── gs-035: SPAWN_PREREQS draws prereq→child edges ──────────────────────────

describe('SPAWN_PREREQS edge drawing (gs-035)', () => {
  it('[gs-035a] edges are drawn from each prereq to the child node', () => {
    const { childId, parentIds } = findNodeWithParents();
    const childX = 600;
    const childY = 300;

    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    // Place child on board
    const childBoardId = board.createObject('kg-node', childX, childY, { kgNodeId: childId });
    kgNodeMap.set(childId, childBoardId);

    // Place prereqs
    const unplacedPrereqs = parentIds.filter(id => getNode(id)).slice(0, 3);
    const { placements } = computePrereqSpawnPlacements(
      { x: childX, y: childY }, unplacedPrereqs, '5', 1200,
    );
    spawnPlacementsToBoard(placements, '5', kgNodeMap, board);

    // Draw edges
    const newEdges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    // For each prereq that has a KG edge to the child, a board edge should exist
    const expectedPrereqEdges = getEdgesAmong([childId, ...unplacedPrereqs])
      .filter(e => e.target === childId);

    for (const kgEdge of expectedPrereqEdges) {
      const prereqBoardId = kgNodeMap.get(kgEdge.source);
      if (!prereqBoardId) continue;
      const boardEdge = newEdges.find(
        e => e.fromId === prereqBoardId && e.toId === childBoardId,
      );
      expect(boardEdge).toBeDefined();
    }
  });
});

// ── gs-036: "All children on board" still draws missing edges ────────────────

describe('All children already on board — missing edge recovery (gs-036)', () => {
  it('[gs-036a] when all children are already placed, missing edges between them are drawn', () => {
    const { parentId, childIds } = findNodeWithChildren();
    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    // Place parent
    const parentBoardId = board.createObject('kg-node', 400, 500, { kgNodeId: parentId });
    kgNodeMap.set(parentId, parentBoardId);

    // Pre-place all children (simulating they were already on the board)
    const validChildren = childIds.filter(id => getNode(id)).slice(0, 3);
    for (let i = 0; i < validChildren.length; i++) {
      const childBoardId = board.createObject('kg-node', 300 + i * 250, 300, {
        kgNodeId: validChildren[i],
      });
      kgNodeMap.set(validChildren[i], childBoardId);
    }

    // Now simulate what should happen when SPAWN_CHILDREN finds all children on board:
    // Even though no new nodes are placed, drawEdgesForVisibleNodes should still run
    // and draw edges between existing visible nodes.
    const newEdges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    const allVisibleIds = [...kgNodeMap.keys()];
    const expectedEdges = getEdgesAmong(allVisibleIds);

    // Every expected edge should be drawn
    expect(newEdges.length).toBe(expectedEdges.length);
  });
});

// ── gs-037: Edge dedup ───────────────────────────────────────────────────────

describe('Edge deduplication (gs-037)', () => {
  it('[gs-037a] calling drawEdgesForVisibleNodes twice does not create duplicate edges', () => {
    const { grade } = findGradeWithAnchorEdges();
    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    const placements = computeAnchorPlacements(grade, { x: 500, y: 400 }, 1200);
    spawnPlacementsToBoard(placements, grade, kgNodeMap, board);

    drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);
    const totalLinesAfterFirst = board.createdLines.length;

    drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);
    const totalLinesAfterSecond = board.createdLines.length;

    expect(totalLinesAfterSecond).toBe(totalLinesAfterFirst);
  });

  it('[gs-037b] drawnEdges set contains correct edge keys after drawing', () => {
    const { grade } = findGradeWithAnchorEdges();
    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    const placements = computeAnchorPlacements(grade, { x: 500, y: 400 }, 1200);
    spawnPlacementsToBoard(placements, grade, kgNodeMap, board);

    drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    const placedKgIds = [...kgNodeMap.keys()];
    const expectedEdges = getEdgesAmong(placedKgIds);

    for (const edge of expectedEdges) {
      expect(drawnEdges.has(`${edge.source}->${edge.target}`)).toBe(true);
    }
  });
});

// ── gs-038: Connector endpoints on node boundaries ──────────────────────────

describe('Connector endpoint positions (gs-038)', () => {
  it('[gs-038a] edge endpoints lie on node boundaries, not at (0,0)', () => {
    const { parentId, childIds } = findNodeWithChildren();
    const parentX = 400;
    const parentY = 500;

    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    const parentBoardId = board.createObject('kg-node', parentX, parentY, { kgNodeId: parentId });
    kgNodeMap.set(parentId, parentBoardId);

    const unplacedChildren = childIds.filter(id => getNode(id)).slice(0, 2);
    const { placements } = computeChildSpawnPlacements(
      { x: parentX, y: parentY }, unplacedChildren, '5', 1200,
    );
    spawnPlacementsToBoard(placements, '5', kgNodeMap, board);
    const newEdges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    for (const edge of newEdges) {
      const [fx, fy, tx, ty] = edge.points!;
      const fromObj = board.getObjectById(edge.fromId!)!;
      const toObj = board.getObjectById(edge.toId!)!;

      // From-point should be on or near the boundary of the from-object
      const fromCenterX = fromObj.x + fromObj.width / 2;
      const fromCenterY = fromObj.y + fromObj.height / 2;
      const distFromCenter = Math.hypot(fx - fromCenterX, fy - fromCenterY);
      // Should be roughly at boundary distance (half width or half height)
      expect(distFromCenter).toBeGreaterThan(0);
      expect(distFromCenter).toBeLessThanOrEqual(
        Math.hypot(fromObj.width / 2, fromObj.height / 2) + 5,
      );

      // To-point should be on or near the boundary of the to-object
      const toCenterX = toObj.x + toObj.width / 2;
      const toCenterY = toObj.y + toObj.height / 2;
      const distToCenter = Math.hypot(tx - toCenterX, ty - toCenterY);
      expect(distToCenter).toBeGreaterThan(0);
      expect(distToCenter).toBeLessThanOrEqual(
        Math.hypot(toObj.width / 2, toObj.height / 2) + 5,
      );
    }
  });

  it('[gs-038b] arrowEnd is true on all drawn edges', () => {
    const { grade } = findGradeWithAnchorEdges();
    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    const placements = computeAnchorPlacements(grade, { x: 500, y: 400 }, 1200);
    spawnPlacementsToBoard(placements, grade, kgNodeMap, board);
    const newEdges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    for (const edge of newEdges) {
      expect(edge.arrowEnd).toBe(true);
    }
  });
});

// ── gs-039: Sequential spawn children then prereqs ──────────────────────────

describe('Sequential spawn children then prereqs (gs-039)', () => {
  it('[gs-039a] spawning children then prereqs of a child draws both edge sets without duplicates', () => {
    const { parentId, childIds } = findNodeWithChildren();
    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();
    const parentX = 400;
    const parentY = 500;

    // Place parent
    const parentBoardId = board.createObject('kg-node', parentX, parentY, { kgNodeId: parentId });
    kgNodeMap.set(parentId, parentBoardId);

    // Spawn children
    const unplacedChildren = childIds.filter(id => getNode(id)).slice(0, 3);
    const { placements: childPlacements } = computeChildSpawnPlacements(
      { x: parentX, y: parentY }, unplacedChildren, '5', 1200,
    );
    spawnPlacementsToBoard(childPlacements, '5', kgNodeMap, board);
    const childEdges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    // Pick first child and spawn its prereqs
    const firstChildId = unplacedChildren[0];
    const prereqIds = getParents(firstChildId).filter(id => !kgNodeMap.has(id) && getNode(id));
    if (prereqIds.length === 0) return;

    const childPlacement = childPlacements[0];
    const { placements: prereqPlacements } = computePrereqSpawnPlacements(
      { x: childPlacement.x, y: childPlacement.y }, prereqIds, '5', 1200,
    );
    spawnPlacementsToBoard(prereqPlacements, '5', kgNodeMap, board);
    const prereqEdges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    // No edge key should appear twice in drawnEdges
    // (This is inherently true if drawEdgesForVisibleNodes works correctly,
    //  but we verify the total line count matches unique edges)
    const totalLines = board.createdLines.length;
    const allVisibleIds = [...kgNodeMap.keys()];
    const allExpectedEdges = getEdgesAmong(allVisibleIds);

    expect(totalLines).toBe(allExpectedEdges.length);
  });
});

// ── gs-040: getObjectById timing — new objects available for edge drawing ────

describe('getObjectById timing for just-created objects (gs-040)', () => {
  it('[gs-040a] board simulator returns just-created objects immediately (reference behavior)', () => {
    const board = makeBoardSimulator();

    const id = board.createObject('kg-node', 100, 200, { kgNodeId: 'test-node' });
    const obj = board.getObjectById(id);

    expect(obj).toBeDefined();
    expect(obj!.x).toBe(100);
    expect(obj!.y).toBe(200);
    expect(obj!.kgNodeId).toBe('test-node');
    expect(obj!.width).toBe(KG_NODE_WIDTH);
    expect(obj!.height).toBe(KG_NODE_HEIGHT);
  });

  it('[gs-040b] edges can reference objects created in the same batch', () => {
    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    const { parentId, childIds } = findNodeWithChildren();

    // Create parent and child in rapid succession (same "batch")
    const parentBoardId = board.createObject('kg-node', 400, 500, { kgNodeId: parentId });
    kgNodeMap.set(parentId, parentBoardId);

    const validChild = childIds.find(id => getNode(id));
    if (!validChild) return;

    const childBoardId = board.createObject('kg-node', 400, 300, { kgNodeId: validChild });
    kgNodeMap.set(validChild, childBoardId);

    // Draw edges immediately — should work
    const edges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    const expectedEdges = getEdgesAmong([parentId, validChild]);
    if (expectedEdges.length > 0) {
      expect(edges.length).toBe(expectedEdges.length);
      for (const e of edges) {
        expect(board.getObjectById(e.fromId!)).toBeDefined();
        expect(board.getObjectById(e.toId!)).toBeDefined();
      }
    }
  });
});

// ── gs-042: Multi-connector count — N children → N edges ─────────────────────

describe('Multi-connector count (gs-042)', () => {
  it('[gs-042a] spawning 3 children with KG edges to parent produces 3 connectors', () => {
    // Find a parent whose children ALL have direct buildsTowards edges from parent
    const { parentId, childIds } = findNodeWithChildren();
    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    const parentBoardId = board.createObject('kg-node', 400, 500, { kgNodeId: parentId });
    kgNodeMap.set(parentId, parentBoardId);

    // getChildren returns nodes connected by buildsTowards FROM parent,
    // so each child should have an edge parent→child
    const validChildren = childIds.filter(id => getNode(id)).slice(0, 3);
    const { placements } = computeChildSpawnPlacements(
      { x: 400, y: 500 }, validChildren, '5', 1200,
    );
    spawnPlacementsToBoard(placements, '5', kgNodeMap, board);
    const newEdges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    // Count edges specifically from parent → each child
    const parentToChildEdges = newEdges.filter(e => e.fromId === parentBoardId);
    const expectedParentChildEdges = getEdgesAmong([parentId, ...validChildren])
      .filter(e => e.source === parentId);

    // Critical assertion: one connector per parent→child KG edge
    expect(parentToChildEdges.length).toBe(expectedParentChildEdges.length);
    expect(parentToChildEdges.length).toBe(validChildren.length);
  });

  it('[gs-042b] spawning 3 prereqs with KG edges to child produces 3 connectors', () => {
    const { childId, parentIds } = findNodeWithParents();
    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    const childBoardId = board.createObject('kg-node', 600, 300, { kgNodeId: childId });
    kgNodeMap.set(childId, childBoardId);

    const validPrereqs = parentIds.filter(id => getNode(id)).slice(0, 3);
    const { placements } = computePrereqSpawnPlacements(
      { x: 600, y: 300 }, validPrereqs, '5', 1200,
    );
    spawnPlacementsToBoard(placements, '5', kgNodeMap, board);
    const newEdges = drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    // Count edges specifically prereq → child
    const prereqToChildEdges = newEdges.filter(e => e.toId === childBoardId);
    const expectedPrereqEdges = getEdgesAmong([childId, ...validPrereqs])
      .filter(e => e.target === childId);

    expect(prereqToChildEdges.length).toBe(expectedPrereqEdges.length);
    expect(prereqToChildEdges.length).toBe(validPrereqs.length);
  });
});

// ── gs-043: Stale getObjectById — simulates the React timing bug ─────────────

describe('Stale getObjectById reproduces timing bug (gs-043)', () => {
  /**
   * Simulates the ACTUAL bug in useExplorerStateMachine:
   * - createObject writes to Yjs immediately
   * - getObjectById reads from objectsRef.current (React state)
   * - React state hasn't updated yet → getObjectById returns undefined for new objects
   *
   * This test uses a "stale board" that only returns objects created BEFORE
   * a snapshot point, simulating the React state lag.
   */
  function makeStaleBoardSimulator() {
    const allObjects = new Map<string, MockBoardObject>();
    const created: MockBoardObject[] = [];
    let nextId = 1;
    let snapshotIds = new Set<string>();

    return {
      createObject(type: string, x: number, y: number, overrides?: Partial<MockBoardObject>): string {
        const id = `obj-${nextId++}`;
        const obj: MockBoardObject = { id, type, x, y, width: 0, height: 0, ...overrides };
        if (type === 'kg-node') {
          obj.width = KG_NODE_WIDTH;
          obj.height = KG_NODE_HEIGHT;
        }
        allObjects.set(id, obj);
        created.push(obj);
        return id;
      },
      /** Simulates React state: only returns objects that existed at snapshot time. */
      getObjectById(id: string): MockBoardObject | undefined {
        if (!snapshotIds.has(id)) return undefined;
        return allObjects.get(id);
      },
      /** Take a "React state snapshot" — future getObjectById only sees these objects. */
      takeSnapshot() {
        snapshotIds = new Set(allObjects.keys());
      },
      /** Simulate React re-render by updating snapshot to current state. */
      flushToReact() {
        snapshotIds = new Set(allObjects.keys());
      },
      addExisting(obj: MockBoardObject) {
        allObjects.set(obj.id, obj);
      },
      get created() { return created; },
      get createdNodes() { return created.filter(o => o.type === 'kg-node'); },
      get createdLines() { return created.filter(o => o.type === 'line'); },
    };
  }

  /** Same drawEdgesForVisibleNodes but using the stale board. */
  function drawEdgesStale(
    kgNodeMap: Map<string, string>,
    drawnEdges: Set<string>,
    board: ReturnType<typeof makeStaleBoardSimulator>,
  ) {
    const allVisibleKgIds = [...kgNodeMap.keys()];
    const edges = getEdgesAmong(allVisibleKgIds);
    const newEdges: MockBoardObject[] = [];

    for (const edge of edges) {
      const edgeKey = `${edge.source}->${edge.target}`;
      if (drawnEdges.has(edgeKey)) continue;

      const fromBoardId = kgNodeMap.get(edge.source);
      const toBoardId = kgNodeMap.get(edge.target);
      if (!fromBoardId || !toBoardId) continue;

      const fromObj = board.getObjectById(fromBoardId);
      const toObj = board.getObjectById(toBoardId);
      if (!fromObj || !toObj) continue;

      const fromCenter = { x: fromObj.x + fromObj.width / 2, y: fromObj.y + fromObj.height / 2 };
      const toCenter = { x: toObj.x + toObj.width / 2, y: toObj.y + toObj.height / 2 };
      const toPt = resolveEndpoint(toObj as any, undefined, fromCenter);
      const fromPt = resolveEndpoint(fromObj as any, undefined, toPt);

      const lineId = board.createObject('line', fromPt.x, fromPt.y, {
        points: [fromPt.x, fromPt.y, toPt.x, toPt.y],
        fromId: fromBoardId,
        toId: toBoardId,
        arrowEnd: true,
      });
      drawnEdges.add(edgeKey);
      newEdges.push(board.getObjectById(lineId)!);
    }
    return newEdges;
  }

  it('[gs-043a] with stale React state, ZERO connectors are drawn for newly spawned children', () => {
    const { parentId, childIds } = findNodeWithChildren();
    const board = makeStaleBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    // Parent exists in React state
    const parentBoardId = board.createObject('kg-node', 400, 500, { kgNodeId: parentId });
    kgNodeMap.set(parentId, parentBoardId);
    board.takeSnapshot(); // Snapshot: only parent is visible to getObjectById

    // Spawn children — creates Yjs objects, but React doesn't know about them
    const validChildren = childIds.filter(id => getNode(id)).slice(0, 3);
    const { placements } = computeChildSpawnPlacements(
      { x: 400, y: 500 }, validChildren, '5', 1200,
    );
    for (const p of placements) {
      if (kgNodeMap.has(p.kgNodeId)) continue;
      const boardId = board.createObject('kg-node', p.x, p.y, { kgNodeId: p.kgNodeId });
      kgNodeMap.set(p.kgNodeId, boardId);
    }
    // NOTE: do NOT call board.flushToReact() — this simulates the bug

    // drawEdgesForVisibleNodes with stale state
    const edges = drawEdgesStale(kgNodeMap, drawnEdges, board);

    // BUG: all parent→child edges fail because getObjectById returns undefined
    // for the newly created child objects. kgNodeMap has the IDs, but React doesn't.
    expect(edges.length).toBe(0); // This is the ACTUAL broken behavior

    // Verify the drawnEdges set is empty — edges were never "drawn"
    // so they can't be retried without clearing drawnEdges
    expect(drawnEdges.size).toBe(0);
  });

  it('[gs-043b] after React flush, connectors draw correctly on retry', () => {
    const { parentId, childIds } = findNodeWithChildren();
    const board = makeStaleBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    const parentBoardId = board.createObject('kg-node', 400, 500, { kgNodeId: parentId });
    kgNodeMap.set(parentId, parentBoardId);
    board.takeSnapshot();

    const validChildren = childIds.filter(id => getNode(id)).slice(0, 3);
    const { placements } = computeChildSpawnPlacements(
      { x: 400, y: 500 }, validChildren, '5', 1200,
    );
    for (const p of placements) {
      if (kgNodeMap.has(p.kgNodeId)) continue;
      const boardId = board.createObject('kg-node', p.x, p.y, { kgNodeId: p.kgNodeId });
      kgNodeMap.set(p.kgNodeId, boardId);
    }

    // First attempt with stale state — 0 edges
    drawEdgesStale(kgNodeMap, drawnEdges, board);
    expect(drawnEdges.size).toBe(0);
    const linesBeforeFlush = board.createdLines.length;

    // Simulate React re-render flushing new objects into objectsRef
    board.flushToReact();

    // Retry — NOW it should work because getObjectById can find the children
    drawEdgesStale(kgNodeMap, drawnEdges, board);

    const expectedEdges = getEdgesAmong([parentId, ...validChildren]);
    const newLines = board.createdLines.length - linesBeforeFlush;
    expect(newLines).toBe(expectedEdges.length);
    expect(newLines).toBeGreaterThan(0);

    // drawnEdges should now contain all expected edge keys
    expect(drawnEdges.size).toBe(expectedEdges.length);

    // All created lines should have valid fromId/toId
    for (const line of board.createdLines.slice(linesBeforeFlush)) {
      expect(line.fromId).toBeDefined();
      expect(line.toId).toBeDefined();
    }
  });

  it('[gs-043c] if drawnEdges incorrectly marked on failed attempt, retry is blocked', () => {
    // This tests a hypothetical worse bug: if the code added to drawnEdges
    // BEFORE verifying getObjectById succeeded, the edge could never be retried.
    // Current code adds AFTER creating the line (line 110), so this shouldn't happen.
    // This test verifies the correct ordering.

    const { parentId, childIds } = findNodeWithChildren();
    const board = makeStaleBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    const parentBoardId = board.createObject('kg-node', 400, 500, { kgNodeId: parentId });
    kgNodeMap.set(parentId, parentBoardId);
    board.takeSnapshot();

    const validChildren = childIds.filter(id => getNode(id)).slice(0, 1);
    if (validChildren.length === 0) return;

    const childBoardId = board.createObject('kg-node', 400, 300, { kgNodeId: validChildren[0] });
    kgNodeMap.set(validChildren[0], childBoardId);
    // Stale state — child not visible

    // Attempt 1: fails, but drawnEdges should NOT be populated
    drawEdgesStale(kgNodeMap, drawnEdges, board);
    expect(drawnEdges.size).toBe(0);

    // Flush and retry
    board.flushToReact();
    const edges = drawEdgesStale(kgNodeMap, drawnEdges, board);

    // Should succeed because drawnEdges wasn't poisoned
    const expected = getEdgesAmong([parentId, validChildren[0]]);
    expect(edges.length).toBe(expected.length);
  });
});

// ── gs-041: Full pipeline integration — grade select through child expand ────

describe('Full pipeline: grade select → child expand (gs-041)', () => {
  it('[gs-041a] end-to-end: select grade, spawn anchors, expand a child — all edges correct', () => {
    const { grade, config } = findGradeWithAnchorEdges();
    const board = makeBoardSimulator();
    const kgNodeMap = new Map<string, string>();
    const drawnEdges = new Set<string>();

    // Step 1: Spawn anchors
    const anchorPlacements = computeAnchorPlacements(grade, { x: 500, y: 400 }, 1200);
    spawnPlacementsToBoard(anchorPlacements, grade, kgNodeMap, board);
    drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    const anchorEdgeCount = board.createdLines.length;

    // Step 2: Find an anchor with children and expand it
    let expandedAnchorId: string | null = null;
    let expandedChildren: string[] = [];
    for (const lane of config.laneOrder) {
      const anchorId = config.anchors[lane];
      if (!anchorId) continue;
      const children = getChildren(anchorId).filter(id => !kgNodeMap.has(id) && getNode(id));
      if (children.length > 0) {
        expandedAnchorId = anchorId;
        expandedChildren = children;
        break;
      }
    }

    if (!expandedAnchorId) return;

    const anchorBoardId = kgNodeMap.get(expandedAnchorId)!;
    const anchorObj = board.getObjectById(anchorBoardId)!;
    const anchorPos = { x: anchorObj.x, y: anchorObj.y };

    const { placements: childPlacements } = computeChildSpawnPlacements(
      anchorPos, expandedChildren, grade, 1200,
    );
    spawnPlacementsToBoard(childPlacements, grade, kgNodeMap, board);
    drawEdgesForVisibleNodes(kgNodeMap, drawnEdges, board);

    const totalEdgeCount = board.createdLines.length;

    // Verify: total edges = anchor edges + new edges from expansion
    const allVisibleIds = [...kgNodeMap.keys()];
    const allExpectedEdges = getEdgesAmong(allVisibleIds);
    expect(totalEdgeCount).toBe(allExpectedEdges.length);

    // Every line must have valid fromId/toId and non-zero points
    for (const line of board.createdLines) {
      expect(line.fromId).toBeDefined();
      expect(line.toId).toBeDefined();
      expect(line.points).toBeDefined();
      expect(line.points!.length).toBe(4);
      expect(line.arrowEnd).toBe(true);
    }
  });
});
