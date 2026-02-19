import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { BoardProvider } from './contexts/BoardContext'
import { SelectionProvider } from './contexts/SelectionContext'

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <AuthProvider>
      <BoardProvider>
        <SelectionProvider>
          <App />
        </SelectionProvider>
      </BoardProvider>
    </AuthProvider>
  </StrictMode>,
)
