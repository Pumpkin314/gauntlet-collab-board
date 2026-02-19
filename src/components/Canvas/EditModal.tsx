/**
 * EditModal — floating modal for editing sticky-note text content.
 * Phase 4 will replace this with inline canvas editing (textarea overlay).
 */

import { useRef } from 'react';
import type { BoardObject } from '../../types/board';

interface EditModalProps {
  note: BoardObject | null;
  onSave: (content: string) => void;
  onClose: () => void;
}

export default function EditModal({ note, onSave, onClose }: EditModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  if (!note) return null;

  return (
    <div
      style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white', borderRadius: 12, padding: 20,
          width: '90%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 15px 0', fontSize: 18 }}>Edit Sticky Note</h3>
        <textarea
          ref={textareaRef}
          autoFocus
          defaultValue={note.content ?? ''}
          style={{
            width: '100%', height: 150, padding: 12, fontSize: 16,
            border: '2px solid #ddd', borderRadius: 8, resize: 'none',
            fontFamily: 'inherit',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.ctrlKey) onSave((e.target as HTMLTextAreaElement).value);
            if (e.key === 'Escape')             onClose();
          }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 15, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', border: '2px solid #ddd', background: 'white',
              borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (textareaRef.current) onSave(textareaRef.current.value);
            }}
            style={{
              padding: '8px 16px', border: '2px solid #4ECDC4', background: '#4ECDC4',
              color: 'white', borderRadius: 8, cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
            }}
          >
            Save (Ctrl+Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
