import type { SupportedShapeType } from './types';

export const SUPPORTED_SHAPE_TYPES: SupportedShapeType[] = [
  'sticky', 'rect', 'circle', 'text', 'line', 'frame',
];

export const SHAPE_DEFAULTS: Record<SupportedShapeType, { width: number; height: number; color: string }> = {
  sticky: { width: 200, height: 200, color: '#FFE66D' },
  rect:   { width: 160, height: 100, color: '#85C1E2' },
  circle: { width: 120, height: 120, color: '#AA96DA' },
  text:   { width: 200, height: 60,  color: '#333333' },
  line:   { width: 200, height: 0,   color: '#333333' },
  frame:  { width: 400, height: 300, color: '#f0f0f0' },
};

export const COLOR_MAP: Record<string, string> = {
  red:        '#FF6B6B',
  orange:     '#FFA07A',
  yellow:     '#FFE66D',
  green:      '#88D8B0',
  blue:       '#85C1E2',
  purple:     '#AA96DA',
  pink:       '#FFB6C1',
  teal:       '#4ECDC4',
  white:      '#FFFFFF',
  black:      '#333333',
  gray:       '#B0B0B0',
  grey:       '#B0B0B0',
  lightblue:  '#85C1E2',
  lightgreen: '#88D8B0',
  coral:      '#FF6B6B',
};

/** Resolve a color name to hex, or pass through if already hex. */
export function resolveColor(color: string): string {
  const lower = color.toLowerCase().trim();
  return COLOR_MAP[lower] ?? color;
}
