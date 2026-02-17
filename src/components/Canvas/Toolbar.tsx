/**
 * Toolbar — tool-selection buttons displayed at the top-center of the canvas.
 * Phase 4 will add cursor, circle, text, and line tools here.
 */

import type { ActiveTool } from '../../types/board';

interface ToolDef {
  tool: ActiveTool;
  label: string;
  title: string;
}

const TOOLS: ToolDef[] = [
  { tool: 'sticky', label: '📝', title: 'Sticky Note' },
  { tool: 'rect',   label: '⬜', title: 'Rectangle' },
];

interface ToolbarProps {
  activeTool: ActiveTool;
  onToolChange: (tool: ActiveTool) => void;
}

export default function Toolbar({ activeTool, onToolChange }: ToolbarProps) {
  return (
    <div style={{
      position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: 8, background: 'white', padding: '8px 12px',
      borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1000,
    }}>
      {TOOLS.map(({ tool, label, title }) => (
        <button
          key={tool}
          title={`${title} (double-click canvas to place)`}
          onClick={() => onToolChange(tool)}
          style={{
            width: 40, height: 40,
            border:       activeTool === tool ? '2px solid #4ECDC4' : '2px solid #ddd',
            background:   activeTool === tool ? '#f0fffe' : 'white',
            borderRadius: 8, cursor: 'pointer', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
