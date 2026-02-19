import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('Sign in error:', err);
      const code = (err as { code?: string }).code ?? 'unknown';
      const message = err instanceof Error ? err.message : String(err);
      setError(`[${code}] ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logo}>CB</div>
          <h1 style={styles.title}>CollabBoard</h1>
          <p style={styles.subtitle}>Real-time Collaborative Whiteboard</p>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <button
          onClick={() => void handleGoogleSignIn()}
          disabled={loading}
          style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }}
        >
          <svg style={styles.googleIcon} viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>

        <div style={styles.features}>
          <div style={styles.feature}>✨ Infinite canvas</div>
          <div style={styles.feature}>🎨 Sticky notes &amp; shapes</div>
          <div style={styles.feature}>👥 Real-time collaboration</div>
          <div style={styles.feature}>🖱️ Multiplayer cursors</div>
        </div>
      </div>
      <div style={styles.footer}>Built with React, Konva.js, and Firebase</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: 20,
  },
  card: {
    background: 'white',
    borderRadius: 20,
    padding: 50,
    maxWidth: 450,
    width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    textAlign: 'center',
  },
  header:   { marginBottom: 40 },
  logo: {
    width: 80, height: 80,
    margin: '0 auto 20px',
    background: 'linear-gradient(135deg, #4ECDC4 0%, #44A08D 100%)',
    borderRadius: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 32, fontWeight: 'bold', color: 'white',
    boxShadow: '0 10px 30px rgba(78, 205, 196, 0.3)',
  },
  title: {
    fontSize: 36, fontWeight: 'bold', margin: '0 0 10px 0',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: { fontSize: 16, color: '#666', margin: 0 },
  error: {
    background: '#fee', color: '#c33',
    padding: '12px 16px', borderRadius: 8, marginBottom: 20,
    fontSize: 14, border: '1px solid #fcc',
  },
  button: {
    width: '100%', padding: '16px 24px',
    fontSize: 16, fontWeight: 600, color: '#333',
    background: 'white', border: '2px solid #ddd',
    borderRadius: 12, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 12, transition: 'all 0.2s ease',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  buttonDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  googleIcon: { width: 20, height: 20 },
  features: {
    marginTop: 40, paddingTop: 30, borderTop: '1px solid #eee',
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
  },
  feature:  { fontSize: 14, color: '#666', textAlign: 'left' },
  footer:   { marginTop: 30, fontSize: 14, color: 'rgba(255,255,255,0.8)' },
};
