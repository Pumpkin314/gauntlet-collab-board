import { Link } from 'react-router-dom';

export default function AccessDenied() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f7fa',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 16,
          padding: 40,
          boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          textAlign: 'center',
          maxWidth: 400,
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 8 }}>
          Access Denied
        </h1>
        <p style={{ color: '#666', marginBottom: 24, lineHeight: 1.5 }}>
          You don't have permission to view this board. Ask the owner to share it with you.
        </p>
        <Link
          to="/"
          style={{
            display: 'inline-block',
            padding: '10px 24px',
            background: '#4ECDC4',
            color: 'white',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Back to My Boards
        </Link>
      </div>
    </div>
  );
}
