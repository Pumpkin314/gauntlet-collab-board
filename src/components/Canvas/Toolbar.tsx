/**
 * Toolbar — tool-selection buttons displayed at the top-center of the canvas.
 *
 * Toolbar is intentionally dumb: it holds no state. It routes clicks to the
 * parent via `onToolChange` (switch tool) or `onModeToggle` (flip infinite
 * ↔ single-shot while keeping the same tool active).
 *
 * Border style is the sole visual mode indicator:
 *   active + infinite → solid teal border
 *   active + single   → dashed teal border
 *   inactive          → grey border
 */

import { useState } from 'react';
import type { ActiveTool } from '../../types/board';

interface ToolDef {
  tool: ActiveTool;
  label: string;
  title: string;
}

const TOOLS: ToolDef[] = [
  { tool: 'cursor',     label: '🖱️',  title: 'Select / Pan' },
  { tool: 'box-select', label: '⬚',   title: 'Box Select' },
  { tool: 'sticky',     label: '📝',  title: 'Sticky Note' },
  { tool: 'rect',       label: '⬜',  title: 'Rectangle' },
  { tool: 'circle',     label: '⭕',  title: 'Circle' },
  { tool: 'text',       label: '🔤',  title: 'Text' },
  { tool: 'line',       label: '╱',   title: 'Line' },
];

interface ToolbarProps {
  activeTool: ActiveTool;
  toolMode: 'infinite' | 'single';
  onToolChange: (tool: ActiveTool) => void;
  /** Fired when the already-active tool button is clicked — toggles infinite ↔ single */
  onModeToggle: () => void;
}

export default function Toolbar({ activeTool, toolMode, onToolChange, onModeToggle }: ToolbarProps) {
  const [hoveredTool, setHoveredTool] = useState<ActiveTool | null>(null);

  return (
    <div style={{
      position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: 8, background: 'white', padding: '8px 12px',
      borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1000,
    }}>
      {TOOLS.map(({ tool, label, title }) => {
        const isActive = activeTool === tool;
        const isInfinite = toolMode === 'infinite';

        let hint: string;
        if (tool === 'cursor') {
          hint = 'Select & pan (hold Space to pan in any mode)';
        } else if (tool === 'box-select') {
          if (!isActive)       hint = 'Drag to select multiple objects';
          else if (isInfinite) hint = '∞ Drag to select — stays active. Click to switch to single-shot';
          else                 hint = 'Single-shot — returns to cursor after selecting. Click again for ∞';
        } else {
          if (!isActive)       hint = `${title} — double-click to place`;
          else if (isInfinite) hint = `∞ ${title} — keeps placing after each double-click. Click to switch to single-shot`;
          else                 hint = `Single-shot — returns to cursor after placing. Click again for ∞`;
        }

        let border: string;
        if (!isActive)       border = '2px solid #ddd';
        else if (isInfinite) border = '2px solid #4ECDC4';
        else                 border = '2px dashed #4ECDC4';

        return (
          <div key={tool} style={{ position: 'relative' }}>
            <button
              onClick={() => {
                if (tool === activeTool && tool !== 'cursor') {
                  onModeToggle();
                } else {
                  onToolChange(tool);
                }
              }}
              onMouseEnter={() => setHoveredTool(tool)}
              onMouseLeave={() => setHoveredTool(null)}
              style={{
                width: 40, height: 40,
                border,
                background:   isActive ? '#f0fffe' : 'white',
                borderRadius: 8, cursor: 'pointer', fontSize: 18,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              {label}
            </button>
            {hoveredTool === tool && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 10px)', left: '50%',
                transform: 'translateX(-50%)',
                background: '#333', color: 'white',
                padding: '5px 9px', borderRadius: 6,
                fontSize: 12, lineHeight: 1.4,
                whiteSpace: 'nowrap', maxWidth: 260, pointerEvents: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)', zIndex: 1001,
              }}>
                {hint}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
