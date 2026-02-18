import { useEffect, useRef, useState } from 'react';

interface Props {
  onStayLoggedIn: () => void;
  onSignOut: () => void;
}

/**
 * Modal shown when the user has been inactive for 4 minutes.
 * Counts down 60 seconds before the parent auto-signs-out.
 * Escape key or "Stay Logged In" dismisses the modal and resets the timer.
 */
export default function InactivityWarningModal({ onStayLoggedIn, onSignOut }: Props) {
  const [seconds, setSeconds] = useState(60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSeconds((s) => Math.max(0, s - 1));
    }, 1000);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStayLoggedIn();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onStayLoggedIn]);

  // Colour shifts from calm → caution → urgent as time runs out
  const countdownColor =
    seconds > 30 ? '#4ECDC4' :
    seconds > 10 ? '#fa0' :
                   '#f44';

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
      >
        <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>
          ⚠️ Session Expiring
        </div>

        <div style={{ fontSize: 40, fontWeight: 'bold', color: countdownColor }}>
          {seconds}
        </div>

        <div style={{ marginTop: 8, color: '#555' }}>
          You'll be signed out in {seconds} second{seconds !== 1 ? 's' : ''} due to inactivity.
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'center' }}>
          <button
            onClick={onStayLoggedIn}
            style={{
              background: '#4ECDC4',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '10px 18px',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Stay Logged In
          </button>
          <button
            onClick={onSignOut}
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
            Sign Out Now
          </button>
        </div>
      </div>
    </div>
  );
}
