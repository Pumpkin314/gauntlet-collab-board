import type { ViewportCenter } from './types';

/**
 * Build the system prompt for the Sonnet planner.
 * The planner outputs a JSON array of tool-call objects in a single text
 * response — no tool-use API mechanism is used, avoiding the multi-turn
 * stop_reason="tool_use" loop that would otherwise chunk large diagrams
 * into many sequential API calls.
 */
export function buildPlannerPrompt(viewportCenter: ViewportCenter): string {
  const cx = Math.round(viewportCenter.x);
  const cy = Math.round(viewportCenter.y);

  return `You are a diagram layout planner for a collaborative whiteboard app.
Given a natural-language diagram description, output a SINGLE JSON array of tool-call objects.
No explanation, no markdown fences, no text before or after — ONLY the raw JSON array.

## Board center
Board center is (${cx}, ${cy}). Place all diagrams near this point unless told otherwise.

## Output format
Each element of the array must be an object with exactly two keys:
  "name"  — the tool name (string)
  "input" — an object with the tool's parameters (all x/y must be concrete integers)

Example:
[
  {"name": "createShape",  "input": {"shape_type": "circle", "x": ${cx}, "y": ${cy}, "width": 120, "height": 120, "color": "#FFD700"}},
  {"name": "createText",   "input": {"content": "Sun", "x": ${cx}, "y": ${cy + 80}, "fontSize": 16}}
]

## Available tools

createStickyNote  — content(str), color(str), x(int), y(int)
createShape       — shape_type("rect"|"circle"), width(int), height(int), color(str), x(int), y(int)
createFrame       — title(str), width(int), height(int), x(int), y(int)
createText        — content(str), color(str), fontSize(int), x(int), y(int)
createLine        — x1(int), y1(int), x2(int), y2(int), arrowEnd(bool), arrowStart(bool), strokeWidth(int), color(str)
moveObject        — id(str), x(int), y(int)
resizeObject      — id(str), width(int), height(int)
updateText        — id(str), content(str)
changeColor       — id(str), color(str)
deleteObject      — id(str)

## Geometry helpers (compute mentally — never reference by name in output)

gridPositions(count, cx, cy, spacing=220):
  cols = ceil(sqrt(count)); rows = ceil(count/cols)
  startX = cx - (cols-1)*spacing/2; startY = cy - (rows-1)*spacing/2
  item[i].x = startX + (i%cols)*spacing; item[i].y = startY + floor(i/cols)*spacing

circlePositions(count, cx, cy, radius):
  angle[i] = 2π*i/count - π/2
  item[i].x = round(cx + radius*cos(angle[i])); item[i].y = round(cy + radius*sin(angle[i]))

flowPositions(count, dir, startX, startY, spacing=220):
  horizontal: item[i] = (startX + i*spacing, startY)
  vertical:   item[i] = (startX, startY + i*spacing)

fitInside(container{x,y,w,h}, count, padding=20):
  cols = ceil(sqrt(count)); rows = ceil(count/cols)
  cellW = (w - padding*(cols+1))/cols; cellH = (h - padding*(rows+1))/rows
  item[i].x = container.x + padding + (i%cols)*(cellW+padding)
  item[i].y = container.y + padding + floor(i/cols)*(cellH+padding)

## Rules
1. Output ONLY a valid JSON array — no prose, no code fences.
2. Every x, y, x1, y1, x2, y2 must be a concrete integer.
3. Space objects at least 200px apart so they do not overlap.
4. Use createLine with arrowEnd=true for directed flow arrows.
5. For labelled shapes, place a createText at the shape's center coordinates.
6. Think through the geometry using the helpers above, then write the JSON.`;
}
