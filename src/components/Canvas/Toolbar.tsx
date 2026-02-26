/**
 * Toolbar — tool-selection buttons displayed at the top-center of the canvas.
 *
 * The line button includes a dropdown chevron to select between plain line,
 * single arrow, and double arrow variants. Selection is sticky across uses.
 */

import { useState, useRef, useEffect } from 'react';
import type { ActiveTool } from '../../types/board';
import type { LineVariant } from './LinePreview';

interface ToolDef {
  tool: ActiveTool;
  label: string;
  title: string;
}

const LINE_VARIANT_OPTIONS: { variant: LineVariant; label: string; title: string }[] = [
  { variant: 'line',         label: '╱',  title: 'Line' },
  { variant: 'arrow',        label: '→',  title: 'Arrow' },
  { variant: 'double-arrow', label: '↔',  title: 'Double Arrow' },
];

const TOOLS: ToolDef[] = [
  { tool: 'cursor',     label: '🖱️',  title: 'Select / Pan' },
  { tool: 'box-select', label: '⬚',   title: 'Box Select' },
  { tool: 'sticky',     label: '📝',  title: 'Sticky Note' },
  { tool: 'rect',       label: '⬜',  title: 'Rectangle' },
  { tool: 'circle',     label: '⭕',  title: 'Circle' },
  { tool: 'text',       label: '🔤',  title: 'Text' },
  { tool: 'line',       label: '╱',   title: 'Line' },
  { tool: 'frame',      label: '⬒',   title: 'Frame' },
];

interface ToolbarProps {
  activeTool: ActiveTool;
  toolMode: 'infinite' | 'single';
  lineVariant: LineVariant;
  onToolChange: (tool: ActiveTool) => void;
  onModeToggle: () => void;
  onLineVariantChange: (variant: LineVariant) => void;
  isViewer?: boolean;
}

export default function Toolbar({ activeTool, toolMode, lineVariant, onToolChange, onModeToggle, onLineVariantChange, isViewer = false }: ToolbarProps) {
  const [hoveredTool, setHoveredTool] = useState<ActiveTool | null>(null);
  const [lineDropdownOpen, setLineDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!lineDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLineDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [lineDropdownOpen]);

  const currentLineLabel = LINE_VARIANT_OPTIONS.find(o => o.variant === lineVariant)?.label ?? '╱';

  return (
    <div data-testid="toolbar" style={{
      position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: 8, background: 'white', padding: '8px 12px',
      borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1000,
    }}>
      {(isViewer ? TOOLS.filter(t => t.tool === 'cursor' || t.tool === 'box-select') : TOOLS).map(({ tool, label, title }) => {
        const isActive = activeTool === tool;
        const isInfinite = toolMode === 'infinite';
        const isLine = tool === 'line';

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
          <div key={tool} style={{ position: 'relative' }} ref={isLine ? dropdownRef : undefined}>
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <button
                data-testid={`tool-${tool}`}
                onClick={() => {
                  if (tool === activeTool && tool !== 'cursor') {
                    onModeToggle();
                  } else {
                    onToolChange(tool);
                  }
                  if (isLine) setLineDropdownOpen(false);
                }}
                onMouseEnter={() => setHoveredTool(tool)}
                onMouseLeave={() => setHoveredTool(null)}
                style={{
                  width: isLine ? 32 : 40, height: 40,
                  border,
                  borderRight: isLine ? 'none' : border,
                  background:   isActive ? '#f0fffe' : 'white',
                  borderRadius: isLine ? '8px 0 0 8px' : 8,
                  cursor: 'pointer', fontSize: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                {isLine ? currentLineLabel : label}
              </button>
              {isLine && (
                <button
                  data-testid="line-variant-dropdown"
                  onClick={() => setLineDropdownOpen(prev => !prev)}
                  style={{
                    width: 16, height: 40,
                    border,
                    borderLeft: `1px solid ${isActive ? '#4ECDC4' : '#ddd'}`,
                    background: isActive ? '#f0fffe' : 'white',
                    borderRadius: '0 8px 8px 0',
                    cursor: 'pointer', fontSize: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0,
                    transition: 'all 0.15s ease',
                  }}
                >
                  ▼
                </button>
              )}
            </div>

            {/* Line variant dropdown */}
            {isLine && lineDropdownOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: '50%',
                transform: 'translateX(-50%)',
                background: 'white', borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                padding: 4, zIndex: 1002,
                minWidth: 140,
              }}>
                {LINE_VARIANT_OPTIONS.map(({ variant, label: vLabel, title: vTitle }) => (
                  <button
                    key={variant}
                    data-testid={`line-variant-${variant}`}
                    onClick={() => {
                      onLineVariantChange(variant);
                      onToolChange('line');
                      setLineDropdownOpen(false);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '6px 10px',
                      border: 'none', borderRadius: 6,
                      background: lineVariant === variant ? '#f0fffe' : 'transparent',
                      cursor: 'pointer', fontSize: 14,
                      fontWeight: lineVariant === variant ? 600 : 400,
                    }}
                  >
                    <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{vLabel}</span>
                    <span>{vTitle}</span>
                  </button>
                ))}
              </div>
            )}

            {hoveredTool === tool && !lineDropdownOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 10px)', left: '50%',
                transform: 'translateX(-50%)',
                background: '#333', color: 'white',
                padding: '5px 9px', borderRadius: 6,
                fontSize: 12, lineHeight: 1.4,
                whiteSpace: 'nowrap', pointerEvents: 'none',
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
