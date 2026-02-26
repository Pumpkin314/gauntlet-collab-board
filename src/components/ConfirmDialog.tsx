import { useEffect } from 'react';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 12,
          padding: 28,
          width: 360,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          textAlign: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>{title}</div>
        <div style={{ color: '#555', marginBottom: 20 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={onConfirm}
            style={{
              background: '#ff6b6b',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '10px 18px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            style={{
              background: 'white',
              color: '#333',
              border: '2px solid #ddd',
              borderRadius: 8,
              padding: '10px 18px',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
