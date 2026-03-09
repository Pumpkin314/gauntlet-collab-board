import nodesJson from './cc-math-nodes.json';
import edgesJson from './cc-math-edges.json';
import componentsJson from './cc-math-components.json';
import spawnConfigJson from './cc-math-spawn-config.json';

export interface StandardNode {
  id: string;
  code: string;
  description: string;
  gradeLevel: string[];
  domain: string;
  domainDescription: string;
}

export interface LearningComponent {
  id: string;
  standardId: string;
  description: string;
}

export interface Edge {
  source: string;
  target: string;
  type: 'buildsTowards' | 'relatesTo';
}

export interface LaneConfig {
  name: string;
  anchor: string;
  domains: Record<string, string[]>;
  nodeIds: string[];
}

export interface CrossGradeEdge {
  source: string;
  target: string;
}

export interface GradeConfig {
  grade: string;
  band: string;
  laneOrder: string[];
  nodeCount: number;
  lanes: Record<string, LaneConfig>;
  anchors: Record<string, string>;
  buildsTowards: CrossGradeEdge[];
  relatesTo: CrossGradeEdge[];
  fromPrevGrade: CrossGradeEdge[];
  toNextGrade: CrossGradeEdge[];
}

const nodes = new Map<string, StandardNode>();
for (const node of nodesJson as StandardNode[]) {
  nodes.set(node.id, node);
}

const buildsTowardsChildren = new Map<string, string[]>();
const buildsTowardsParents = new Map<string, string[]>();
const relatesToMap = new Map<string, string[]>();

for (const edge of edgesJson as Edge[]) {
  if (edge.type === 'buildsTowards') {
    const children = buildsTowardsChildren.get(edge.source) ?? [];
    children.push(edge.target);
    buildsTowardsChildren.set(edge.source, children);

    const parents = buildsTowardsParents.get(edge.target) ?? [];
    parents.push(edge.source);
    buildsTowardsParents.set(edge.target, parents);
  } else if (edge.type === 'relatesTo') {
    const related = relatesToMap.get(edge.source) ?? [];
    related.push(edge.target);
    relatesToMap.set(edge.source, related);
  }
}

const componentsMap = new Map<string, LearningComponent[]>();
for (const comp of componentsJson as LearningComponent[]) {
  const list = componentsMap.get(comp.standardId) ?? [];
  list.push(comp);
  componentsMap.set(comp.standardId, list);
}

const spawnConfig = spawnConfigJson as { grades: Record<string, GradeConfig> };

const nodeLaneIndex = new Map<string, Map<string, string>>();
for (const [grade, config] of Object.entries(spawnConfig.grades)) {
  for (const [laneId, lane] of Object.entries(config.lanes)) {
    for (const nodeId of (lane as LaneConfig).nodeIds) {
      let gradeMap = nodeLaneIndex.get(nodeId);
      if (!gradeMap) {
        gradeMap = new Map();
        nodeLaneIndex.set(nodeId, gradeMap);
      }
      gradeMap.set(grade, laneId);
    }
  }
}

const allBuildsTowardsEdges: Edge[] = (edgesJson as Edge[]).filter(
  (e) => e.type === 'buildsTowards',
);

export function getNode(id: string): StandardNode | undefined {
  return nodes.get(id);
}

export function getChildren(id: string): string[] {
  return buildsTowardsChildren.get(id) ?? [];
}

export function getParents(id: string): string[] {
  return buildsTowardsParents.get(id) ?? [];
}

/** Returns relatesTo neighbors (edges stored source-side in the data). */
export function getRelated(id: string): string[] {
  return relatesToMap.get(id) ?? [];
}

export function getComponents(standardId: string): LearningComponent[] {
  return componentsMap.get(standardId) ?? [];
}

export function getGradeConfig(grade: string): GradeConfig {
  return spawnConfig.grades[grade];
}

/** Returns all buildsTowards edges where both endpoints are in the given set. */
export function getEdgesAmong(nodeIds: string[]): Edge[] {
  const idSet = new Set(nodeIds);
  return allBuildsTowardsEdges.filter(
    (e) => idSet.has(e.source) && idSet.has(e.target),
  );
}

export function getLaneForNode(
  nodeId: string,
  grade: string,
): string | undefined {
  return nodeLaneIndex.get(nodeId)?.get(grade);
}

export function getAllGrades(): string[] {
  return Object.keys(spawnConfig.grades);
}

export function getNodeCount(): number {
  return nodes.size;
}
