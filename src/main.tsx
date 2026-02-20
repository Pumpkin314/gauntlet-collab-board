import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { BoardProvider } from './contexts/BoardContext'
import { SelectionProvider } from './contexts/SelectionContext'

const isTestMode = import.meta.env.VITE_TEST_AUTH_BYPASS === 'true';

const rootEl = document.getElementById('root')!;

async function render() {
  const PerfBridgeConnector = isTestMode
    ? (await import('./components/PerfBridgeConnector')).default
    : null;

  createRoot(rootEl).render(
    <StrictMode>
      <AuthProvider>
        <BoardProvider>
          <SelectionProvider>
            <App />
            {PerfBridgeConnector && <PerfBridgeConnector />}
          </SelectionProvider>
        </BoardProvider>
      </AuthProvider>
    </StrictMode>,
  );
}

render();
