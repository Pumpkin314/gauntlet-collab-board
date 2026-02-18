/**
 * shapeRegistry
 *
 * Central registry mapping ShapeType → component + creation defaults.
 * Adding a new shape type = one entry here + one component file.
 * Canvas/ObjectRenderer uses this to render the correct component for each object.
 */

import type { ComponentType } from 'react';
import type { BoardObject, ShapeProps, ShapeType } from '../types/board';

export interface ShapeRegistryEntry {
  /** The Konva-based React component that renders this shape */
  component: ComponentType<any>;   // any: concrete shapes may extend ShapeProps
  /** Default field values when creating a new object of this type */
  defaults: Partial<BoardObject>;
  minWidth:  number;
  minHeight: number;
}

// Registry is populated lazily via registerShape() to avoid circular imports
// when shape components import from this file.
const registry: Partial<Record<ShapeType, ShapeRegistryEntry>> = {};

export function registerShape(type: ShapeType, entry: ShapeRegistryEntry): void {
  registry[type] = entry;
}

export function getShapeEntry(type: ShapeType): ShapeRegistryEntry | undefined {
  return registry[type];
}

export function getAllShapeTypes(): ShapeType[] {
  return Object.keys(registry) as ShapeType[];
}
