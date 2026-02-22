import type { BoardObject } from '../types/board';

export interface ConnectedLine {
  line: BoardObject;
  endpoint: 'from' | 'to';
}

/** Returns all lines connected to a given object via fromId/toId. */
export function getConnectedLines(objectId: string, allObjects: BoardObject[]): ConnectedLine[] {
  const results: ConnectedLine[] = [];
  for (const obj of allObjects) {
    if (obj.type !== 'line') continue;
    if (obj.fromId === objectId) results.push({ line: obj, endpoint: 'from' });
    if (obj.toId === objectId) results.push({ line: obj, endpoint: 'to' });
  }
  return results;
}
