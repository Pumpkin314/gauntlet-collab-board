/** A single action emitted by a template expansion (mirrors a tool call). */
interface TemplateAction {
  name: string;
  input: Record<string, unknown>;
  /**
   * If set, the executor resolves the created object ID at this index and
   * injects it as `parentId` on this action before dispatching.
   * Enables frame containment without knowing real IDs at expansion time.
   */
  parentActionIndex?: number;
}

/**
 * The result of expanding a template.
 * - `actions`: ordered list of board actions to dispatch
 * - `outputs`: named index map into `actions` for referencing key frames by role
 */
interface TemplateExpansion {
  actions: TemplateAction[];
  /** Maps semantic role → index in `actions` array */
  outputs: Record<string, number>;
}

interface TemplateDefinition {
  id: string;
  description: string;
  expand(cx: number, cy: number, options?: Record<string, unknown>): TemplateExpansion;
}

// ── Layout helpers ────────────────────────────────────────────────────────────

const COL_WIDTH  = 300;
const COL_HEIGHT = 460;
const GAP        = 20;
const PADDING    = 20;
const TITLE_BAR  = 60;

/**
 * Shared column-layout template builder.
 * Produces one outer frame + N inner column frames.
 */
function columnTemplate(
  cx: number,
  cy: number,
  columns: string[],
  outerTitle: string,
): { actions: TemplateAction[]; outputs: Record<string, number> } {
  const n = columns.length;
  const outerWidth  = n * COL_WIDTH + (n - 1) * GAP + PADDING * 2;
  const outerHeight = COL_HEIGHT + TITLE_BAR + PADDING * 2;

  const outerX = cx - outerWidth  / 2;
  const outerY = cy - outerHeight / 2;

  const actions: TemplateAction[] = [
    { name: 'createFrame', input: { title: outerTitle, x: outerX, y: outerY, width: outerWidth, height: outerHeight } },
  ];
  const outputs: Record<string, number> = { frame_outer: 0 };

  const colY = outerY + TITLE_BAR + PADDING;
  for (let i = 0; i < n; i++) {
    const colX = outerX + PADDING + i * (COL_WIDTH + GAP);
    // parentActionIndex: 0 = outer frame (created first)
    actions.push({ name: 'createFrame', input: { title: columns[i], x: colX, y: colY, width: COL_WIDTH, height: COL_HEIGHT }, parentActionIndex: 0 });
    outputs[`frame_${i}`] = i + 1;
  }

  return { actions, outputs };
}

// ── Template definitions ──────────────────────────────────────────────────────

const swot: TemplateDefinition = {
  id: 'swot',
  description: 'SWOT Analysis — 2×2 quadrant layout inside an outer frame',
  expand(cx, cy) {
    const outerW = 900;
    const outerH = 720;
    const innerW = 415;
    const innerH = 295;
    const outerX = cx - outerW / 2;
    const outerY = cy - outerH / 2;

    // Quadrant origin: below the 60px title bar, 25px padding inside the outer frame
    const innerTop  = outerY + TITLE_BAR + PADDING;
    const innerLeft = outerX + PADDING;

    const actions: TemplateAction[] = [
      { name: 'createFrame', input: { title: 'SWOT Analysis', x: outerX, y: outerY, width: outerW, height: outerH } },
      // Row 0 — parentActionIndex: 0 = outer frame
      { name: 'createFrame', input: { title: 'Strengths',     x: innerLeft,                y: innerTop,                width: innerW, height: innerH }, parentActionIndex: 0 },
      { name: 'createFrame', input: { title: 'Weaknesses',    x: innerLeft + innerW + GAP, y: innerTop,                width: innerW, height: innerH }, parentActionIndex: 0 },
      // Row 1
      { name: 'createFrame', input: { title: 'Opportunities', x: innerLeft,                y: innerTop + innerH + GAP, width: innerW, height: innerH }, parentActionIndex: 0 },
      { name: 'createFrame', input: { title: 'Threats',       x: innerLeft + innerW + GAP, y: innerTop + innerH + GAP, width: innerW, height: innerH }, parentActionIndex: 0 },
    ];

    return {
      actions,
      outputs: {
        frame_main:              0,
        quadrant_strengths:      1,
        quadrant_weaknesses:     2,
        quadrant_opportunities:  3,
        quadrant_threats:        4,
      },
    };
  },
};

const retrospective: TemplateDefinition = {
  id: 'retrospective',
  description: 'Retrospective board — 3 column frames',
  expand(cx, cy, options) {
    const cols = (options?.columns as string[] | undefined) ?? ["What Went Well", "What Didn't", "Action Items"];
    const { actions, outputs } = columnTemplate(cx, cy, cols, 'Retrospective');
    return { actions, outputs };
  },
};

const kanban: TemplateDefinition = {
  id: 'kanban',
  description: 'Kanban board — 3 column frames (To Do / In Progress / Done)',
  expand(cx, cy, options) {
    const cols = (options?.columns as string[] | undefined) ?? ['To Do', 'In Progress', 'Done'];
    const { actions, outputs } = columnTemplate(cx, cy, cols, 'Kanban Board');
    return { actions, outputs };
  },
};

const journey_map: TemplateDefinition = {
  id: 'journey_map',
  description: 'User Journey Map — configurable number of stage columns',
  expand(cx, cy, options) {
    const defaultStages = ['Awareness', 'Consideration', 'Decision', 'Onboarding', 'Retention'];
    const stages = (options?.stages as string[] | undefined) ?? defaultStages;
    const title  = (options?.title  as string | undefined)   ?? 'User Journey Map';
    const { actions, outputs: rawOutputs } = columnTemplate(cx, cy, stages, title);

    // Rename outputs: frame_N → stage_N, frame_outer stays
    const outputs: Record<string, number> = { frame_main: rawOutputs.frame_outer };
    for (let i = 0; i < stages.length; i++) {
      outputs[`stage_${i}`] = rawOutputs[`frame_${i}`]!;
    }
    return { actions, outputs };
  },
};

const pros_cons: TemplateDefinition = {
  id: 'pros_cons',
  description: 'Pros & Cons comparison — 2 column frames with optional blank stickies',
  expand(cx, cy, options) {
    const { actions, outputs: rawOutputs } = columnTemplate(cx, cy, ['Pros', 'Cons'], 'Pros & Cons');

    // Optionally seed blank sticky notes inside each column frame
    const rows = (options?.rows as number | undefined) ?? 0;
    if (rows > 0) {
      const outerW = 2 * COL_WIDTH + GAP + PADDING * 2;
      const outerX = cx - outerW / 2;
      const outerY = cy - (COL_HEIGHT + TITLE_BAR + PADDING * 2) / 2;
      const colY   = outerY + TITLE_BAR + PADDING;

      for (let col = 0; col < 2; col++) {
        const colX = outerX + PADDING + col * (COL_WIDTH + GAP);
        // Column frames are at actions indices 1 (Pros) and 2 (Cons)
        const colFrameIndex = col + 1;
        for (let row = 0; row < rows; row++) {
          actions.push({
            name: 'createStickyNote',
            input: { content: '', x: colX + 10, y: colY + 10 + row * 90 },
            parentActionIndex: colFrameIndex,
          });
        }
      }
    }

    return {
      actions,
      outputs: {
        frame_outer: rawOutputs.frame_outer,
        frame_pros:  rawOutputs.frame_0!,
        frame_cons:  rawOutputs.frame_1!,
      },
    };
  },
};

const matrix_2x2: TemplateDefinition = {
  id: 'matrix_2x2',
  description: '2×2 prioritization matrix — 4 standalone quadrant frames',
  expand(cx, cy, options) {
    const labels = (options?.labels as Record<string, string> | undefined) ?? {};
    const tl = labels.top_left     ?? 'High Impact / Low Effort';
    const tr = labels.top_right    ?? 'High Impact / High Effort';
    const bl = labels.bottom_left  ?? 'Low Impact / Low Effort';
    const br = labels.bottom_right ?? 'Low Impact / High Effort';

    const qW = 415;
    const qH = 295;
    const left  = cx - qW - GAP / 2;
    const right  = cx + GAP / 2;
    const top    = cy - qH - GAP / 2;
    const bottom = cy + GAP / 2;

    const actions: TemplateAction[] = [
      { name: 'createFrame', input: { title: tl, x: left,  y: top,    width: qW, height: qH } },
      { name: 'createFrame', input: { title: tr, x: right, y: top,    width: qW, height: qH } },
      { name: 'createFrame', input: { title: bl, x: left,  y: bottom, width: qW, height: qH } },
      { name: 'createFrame', input: { title: br, x: right, y: bottom, width: qW, height: qH } },
    ];

    return {
      actions,
      outputs: {
        quadrant_tl: 0,
        quadrant_tr: 1,
        quadrant_bl: 2,
        quadrant_br: 3,
      },
    };
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const TEMPLATE_REGISTRY: Record<string, TemplateDefinition> = {
  swot,
  retrospective,
  kanban,
  journey_map,
  pros_cons,
  matrix_2x2,
};
