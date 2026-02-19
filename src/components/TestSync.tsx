import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { collection, addDoc, onSnapshot, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface SyncMessage {
  id:        string;
  text:      string;
  client:    string;
  timestamp: Timestamp | null;
}

/**
 * Debug component for verifying Firestore real-time sync.
 * Displays recent messages synced across all connected clients.
 */
export default function TestSync() {
  const [messages, setMessages] = useState<SyncMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'test-sync'),
      orderBy('timestamp', 'desc'),
      limit(10),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const newMessages: SyncMessage[] = snapshot.docs.map((d) => ({
          id:        d.id,
          text:      (d.data()['text'] as string) ?? '',
          client:    (d.data()['client'] as string) ?? '',
          timestamp: (d.data()['timestamp'] as Timestamp | null) ?? null,
        }));
        setMessages(newMessages);
        setLoading(false);
      },
      (err) => {
        console.error('Firestore error:', err);
        setError(err.message);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    try {
      await addDoc(collection(db, 'test-sync'), {
        text:      inputText,
        timestamp: serverTimestamp(),
        client:    Math.random().toString(36).substring(7),
      });
      setInputText('');
    } catch (err) {
      console.error('Error adding document:', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}><h3>🔄 Connecting to Firestore...</h3></div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.card, borderColor: '#ff4444' }}>
          <h3>❌ Firestore Error</h3>
          <p style={{ color: '#ff4444', fontFamily: 'monospace', fontSize: 12 }}>{error}</p>
          <p style={{ marginTop: 10, fontSize: 14 }}>Check your Firebase configuration in .env file</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h3>✅ Firestore Real-time Sync Active</h3>
        <p style={{ fontSize: 14, color: '#666', marginBottom: 15 }}>
          Open this page in multiple tabs to see real-time updates
        </p>

        <form onSubmit={(e) => void handleSendMessage(e)} style={{ marginBottom: 20 }}>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            style={styles.input}
          />
          <button type="submit" style={styles.button}>Send</button>
        </form>

        <div style={styles.messageList}>
          <strong>Recent messages ({messages.length}):</strong>
          {messages.length === 0 ? (
            <div style={{ color: '#999', fontSize: 14, marginTop: 10 }}>
              No messages yet. Send one to test sync!
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} style={styles.message}>
                <span style={{ color: '#4ECDC4', fontWeight: 'bold' }}>{msg.client}:</span>{' '}
                {msg.text}
                <span style={{ fontSize: 11, color: '#999', marginLeft: 10 }}>
                  {msg.timestamp?.toDate().toLocaleTimeString() ?? 'pending...'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container:   { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5', padding: 20 },
  card:        { background: 'white', borderRadius: 12, padding: 30, maxWidth: 600, width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', border: '2px solid #4ECDC4' },
  input:       { width: 'calc(100% - 100px)', padding: '10px 15px', fontSize: 14, border: '2px solid #ddd', borderRadius: 8, outline: 'none', marginRight: 10 },
  button:      { padding: '10px 20px', fontSize: 14, background: '#4ECDC4', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' },
  messageList: { marginTop: 20, padding: 15, background: '#f9f9f9', borderRadius: 8, maxHeight: 300, overflowY: 'auto' },
  message:     { padding: '8px 0', borderBottom: '1px solid #eee', fontSize: 14 },
};
