import {
  getGradeConfig,
  getNode,
  getEdgesAmong,
  getLaneForNode,
} from '../data/knowledge-graph-v2/index';
import type { SpawnInstruction, EdgeInstruction } from './quizTypes';

const LANE_COLORS: Record<string, string> = {
  number: '#3B82F6',
  algebra: '#8B5CF6',
  functions: '#EC4899',
  data: '#F59E0B',
  geometry: '#10B981',
};

const CHILD_Y_OFFSET = -200;
const PREREQ_Y_OFFSET = 200;
const SAME_LANE_X_GAP = 120;
const VERTICAL_HIERARCHY_OFFSET = 30;

/**
 * Compute spawn positions for a grade's anchor nodes, spread evenly across the viewport.
 * Anchors involved in buildsTowards edges get subtle vertical offsets
 * to hint at dependency direction.
 */
export function computeAnchorPlacements(
  grade: string,
  viewportCenter: { x: number; y: number },
  viewportWidth: number,
): SpawnInstruction[] {
  const config = getGradeConfig(grade);
  const laneOrder = config.laneOrder;
  const laneCount = laneOrder.length;
  const leftEdge = viewportCenter.x - viewportWidth / 2;

  const sourceAnchors = new Set<string>();
  const targetAnchors = new Set<string>();
  for (const edge of config.buildsTowards) {
    sourceAnchors.add(edge.source);
    targetAnchors.add(edge.target);
  }

  const placements: SpawnInstruction[] = [];

  for (let i = 0; i < laneCount; i++) {
    const lane = laneOrder[i];
    const anchorId = config.anchors[lane];
    if (!anchorId) continue;

    const node = getNode(anchorId);
    if (!node) continue;

    const xFraction = (i + 1) / (laneCount + 1);
    const x = leftEdge + viewportWidth * xFraction;

    let y = viewportCenter.y;
    if (sourceAnchors.has(anchorId)) y -= VERTICAL_HIERARCHY_OFFSET;
    if (targetAnchors.has(anchorId)) y += VERTICAL_HIERARCHY_OFFSET;

    placements.push({
      kgNodeId: anchorId,
      lane,
      laneColor: LANE_COLORS[lane] ?? '#6B7280',
      x: Math.round(x),
      y: Math.round(y),
      code: node.code ?? '',
      description: node.description,
    });
  }

  return placements;
}

export function computeAnchorEdges(
  grade: string,
  placedAnchorKgIds: string[],
): EdgeInstruction[] {
  const kgEdges = getEdgesAmong(placedAnchorKgIds);
  return kgEdges.map(e => ({
    sourceKgNodeId: e.source,
    targetKgNodeId: e.target,
  }));
}

/**
 * Position child nodes above the parent, spread by lane.
 * Children sharing a lane are stacked horizontally with SAME_LANE_X_GAP spacing.
 */
export function computeChildSpawnPlacements(
  parentPosition: { x: number; y: number },
  childKgNodeIds: string[],
  grade: string,
  viewportWidth: number,
  maxSpawn = 3,
): { placements: SpawnInstruction[]; remaining: number } {
  return computeRelativeSpawnPlacements(
    parentPosition,
    childKgNodeIds,
    grade,
    viewportWidth,
    maxSpawn,
    CHILD_Y_OFFSET,
  );
}

export function computePrereqSpawnPlacements(
  childPosition: { x: number; y: number },
  prereqKgNodeIds: string[],
  grade: string,
  viewportWidth: number,
  maxSpawn = 3,
): { placements: SpawnInstruction[]; remaining: number } {
  return computeRelativeSpawnPlacements(
    childPosition,
    prereqKgNodeIds,
    grade,
    viewportWidth,
    maxSpawn,
    PREREQ_Y_OFFSET,
  );
}

function computeRelativeSpawnPlacements(
  originPosition: { x: number; y: number },
  nodeIds: string[],
  grade: string,
  viewportWidth: number,
  maxSpawn: number,
  yOffset: number,
): { placements: SpawnInstruction[]; remaining: number } {
  const toPlace = nodeIds.slice(0, maxSpawn);
  const remaining = Math.max(0, nodeIds.length - maxSpawn);

  const laneCounts = new Map<string, number>();
  const placements: SpawnInstruction[] = [];

  const totalWidth = Math.min(viewportWidth * 0.6, toPlace.length * SAME_LANE_X_GAP * 2);
  const startX = originPosition.x - totalWidth / 2;
  const spacing = toPlace.length > 1 ? totalWidth / (toPlace.length - 1) : 0;

  for (let i = 0; i < toPlace.length; i++) {
    const nodeId = toPlace[i];
    const node = getNode(nodeId);
    if (!node) continue;

    const lane = getLaneForNode(nodeId, grade) ?? 'number';
    const laneCount = laneCounts.get(lane) ?? 0;
    laneCounts.set(lane, laneCount + 1);

    const x = toPlace.length === 1
      ? originPosition.x
      : startX + spacing * i;

    const laneXOffset = laneCount * SAME_LANE_X_GAP;

    placements.push({
      kgNodeId: nodeId,
      lane,
      laneColor: LANE_COLORS[lane] ?? '#6B7280',
      x: Math.round(x + laneXOffset),
      y: Math.round(originPosition.y + yOffset),
      code: node.code ?? '',
      description: node.description,
    });
  }

  return { placements, remaining };
}

export function getWelcomeMessage(grade: string, anchorCount: number): string {
  return `I've placed ${anchorCount} key concepts for Grade ${grade} on your board. Click any node to get started!`;
}

export function getDontKnowMessage(standardCode: string): string {
  return `No worries! ${standardCode} can be tricky. When you're ready, click it again to explore what leads up to it.`;
}

export function getQuizResultMessage(correct: boolean, standardCode: string): string {
  if (correct) {
    return `Nice work on ${standardCode}! You've got this.`;
  }
  return `That's a tough one! Click ${standardCode} again to try once more, or explore what leads up to it.`;
}
