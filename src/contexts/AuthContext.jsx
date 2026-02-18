import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider
} from 'firebase/auth';
import { auth } from '../firebase';

const AuthContext = createContext();

// Hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

// Auth provider component
export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sign in with Google
  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  };

  // Sign out
  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Dual-timer inactivity system: warn at 4 min, sign out at 5 min
  const WARN_MS  = 4 * 60 * 1000;  // show warning popup
  const IDLE_MS  = 5 * 60 * 1000;  // sign out (1 min after warning)

  const [showInactivityWarning, setShowInactivityWarning] = useState(false);
  const warnTimerRef   = useRef(null);
  const logoutTimerRef = useRef(null);

  // Stable ref so the event listener doesn't capture a stale closure.
  const resetTimerRef = useRef(null);

  const stayLoggedIn = useCallback(() => {
    if (resetTimerRef.current) resetTimerRef.current();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const resetTimer = () => {
      clearTimeout(warnTimerRef.current);
      clearTimeout(logoutTimerRef.current);
      setShowInactivityWarning(false);

      warnTimerRef.current = setTimeout(() => {
        setShowInactivityWarning(true);
        // Fire sign-out 1 minute after the warning appears
        logoutTimerRef.current = setTimeout(() => {
          logout();
        }, IDLE_MS - WARN_MS);
      }, WARN_MS);
    };

    resetTimerRef.current = resetTimer;

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer(); // arm timers immediately on login

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      clearTimeout(warnTimerRef.current);
      clearTimeout(logoutTimerRef.current);
    };
  }, [currentUser]);

  const value = {
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
