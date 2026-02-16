import { useState } from 'react';
import Canvas from './components/Canvas';
import TestSync from './components/TestSync';
import './App.css';

function App() {
  const [view, setView] = useState('canvas'); // 'canvas' or 'test-sync'

  return (
    <div className="app">
      {/* View toggle */}
      <div className="view-toggle">
        <button
          className={view === 'canvas' ? 'active' : ''}
          onClick={() => setView('canvas')}
        >
          Canvas (Konva)
        </button>
        <button
          className={view === 'test-sync' ? 'active' : ''}
          onClick={() => setView('test-sync')}
        >
          Test Firestore Sync
        </button>
      </div>

      {/* Render selected view */}
      {view === 'canvas' ? <Canvas /> : <TestSync />}
    </div>
  );
}

export default App;
