/**
 * SelectionContext
 *
 * Manages which board objects are currently selected.
 * Supports single select, shift+click multi-select, select-all, and deselect-all.
 * The Transformer in Canvas.tsx attaches to all selected Konva nodes.
 */

import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface SelectionContextValue {
  selectedIds: Set<string>;
  /** Single select — clears others */
  select(id: string): void;
  /** Toggle one ID without clearing others (shift+click) */
  toggleSelect(id: string): void;
  /** Replace entire selection with a new set */
  setSelection(ids: Set<string>): void;
  selectAll(ids: string[]): void;
  deselectAll(): void;
  isSelected(id: string): boolean;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within SelectionProvider');
  return ctx;
}

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const select = useCallback((id: string) => {
    setSelectedIds(new Set([id]));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setSelection = useCallback((ids: Set<string>) => {
    setSelectedIds(new Set(ids));
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  return (
    <SelectionContext.Provider
      value={{ selectedIds, select, toggleSelect, setSelection, selectAll, deselectAll, isSelected }}
    >
      {children}
    </SelectionContext.Provider>
  );
}
