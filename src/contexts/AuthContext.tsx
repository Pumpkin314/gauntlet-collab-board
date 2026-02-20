/**
 * AuthContext
 *
 * Provides Firebase Auth state and a dual-timer inactivity system:
 * warn at 4 minutes of idle, auto-sign-out at 5 minutes.
 */

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User } from 'firebase/auth';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth } from '../firebase';

// ── context type ────────────────────────────────────────────────────────────

interface AuthContextValue {
  currentUser: User | null;
  signInWithGoogle(): Promise<User>;
  logout(): Promise<void>;
  loading: boolean;
  showInactivityWarning: boolean;
  stayLoggedIn(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── hook ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ── provider ────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const signInWithGoogle = async (): Promise<User> => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return result.user;
  };

  const logout = async (): Promise<void> => {
    await signOut(auth);
  };

  useEffect(() => {
    // Auth bypass: inject a static mock user so Google OAuth is never invoked.
    // Decoupled from VITE_TEST_SKIP_SYNC so P2P tests can run with real WebRTC
    // while still skipping the Firebase auth round-trip.
    if (import.meta.env.VITE_TEST_AUTH_BYPASS === 'true') {
      const key = 'TEST_BYPASS_UID';
      let uid = window.sessionStorage.getItem(key);
      if (!uid) {
        uid = `test-${crypto.randomUUID()}`;
        window.sessionStorage.setItem(key, uid);
      }
      const suffix = uid.slice(-4);
      setCurrentUser({
        uid,
        displayName: `Test User ${suffix}`,
        email: `${uid}@example.com`,
        photoURL: null,
      } as unknown as User);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ── Inactivity timers ──────────────────────────────────────────────────────

  // Warn at 4 min, sign out 1 min after the warning (5 min total).
  const WARN_MS  = 4 * 60 * 1000;
  const IDLE_MS  = 5 * 60 * 1000;

  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const warnTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable ref so the event listener doesn't capture a stale closure.
  const resetTimerRef = useRef<(() => void) | null>(null);

  const stayLoggedIn = useCallback(() => {
    resetTimerRef.current?.();
  }, []);

  // Depend only on uid so the effect doesn't re-arm on unrelated User field changes.
  const uid = currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid) return;

    const resetTimer = () => {
      clearTimeout(warnTimerRef.current ?? undefined);
      clearTimeout(logoutTimerRef.current ?? undefined);
      setShowInactivityWarning(false);

      warnTimerRef.current = setTimeout(() => {
        setShowInactivityWarning(true);
        logoutTimerRef.current = setTimeout(() => {
          void logout();
        }, IDLE_MS - WARN_MS);
      }, WARN_MS);
    };

    resetTimerRef.current = resetTimer;

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'] as const;
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      clearTimeout(warnTimerRef.current ?? undefined);
      clearTimeout(logoutTimerRef.current ?? undefined);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const value: AuthContextValue = {
    currentUser,
    signInWithGoogle,
    logout,
    loading,
    showInactivityWarning,
    stayLoggedIn,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
