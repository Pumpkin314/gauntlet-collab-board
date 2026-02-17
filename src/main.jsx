import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { BoardProvider } from './contexts/BoardContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <BoardProvider>
        <App />
      </BoardProvider>
    </AuthProvider>
  </StrictMode>,
)
