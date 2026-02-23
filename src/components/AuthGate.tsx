import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Login from './Login';

export default function AuthGate({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Login />;
  return <>{children}</>;
}
