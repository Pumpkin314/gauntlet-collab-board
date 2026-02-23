import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { DebugProvider } from './contexts/DebugContext'
import AuthGate from './components/AuthGate'
import BoardLayout from './components/BoardLayout'
import Dashboard from './components/Dashboard'

const rootEl = document.getElementById('root')!;

createRoot(rootEl).render(
  <StrictMode>
    <AuthProvider>
      <DebugProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AuthGate><Dashboard /></AuthGate>} />
            <Route path="/board/:boardId" element={<AuthGate><BoardLayout /></AuthGate>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </DebugProvider>
    </AuthProvider>
  </StrictMode>,
);
