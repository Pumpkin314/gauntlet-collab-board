# Auth & Session Domain

## Overview

Firebase Auth with Google OAuth sign-in, plus a dual-timer inactivity system that warns users before auto-signing them out.

## Key Files

| File | LoC | Role |
|---|---|---|
| `src/contexts/AuthContext.tsx` | 149 | Auth state, login/logout, inactivity timers |
| `src/components/Login.tsx` | 121 | Login page with Google OAuth button |
| `src/components/InactivityWarningModal.tsx` | 110 | Countdown modal before auto-signout |
| `src/App.tsx` | 132 | Top bar with user profile, presence list, conditional login/canvas |
| `src/firebase.ts` | 22 | Firebase SDK init |

## Architecture

### Auth Flow
1. `AuthContext` listens to `onAuthStateChanged` from Firebase
2. Unauthenticated → show `Login.tsx`
3. Authenticated → show `App.tsx` → `Canvas.tsx`
4. Test mode bypass: if `VITE_TEST_AUTH=true`, auto-creates a test user without Firebase

### Inactivity System
- **Warning timer**: 4 minutes of no activity → show `InactivityWarningModal`
- **Signout timer**: 60-second countdown in modal → auto `signOut()`
- Activity events (mousemove, keydown, click, scroll) reset the warning timer
- "Stay Logged In" button or Escape key dismisses modal and resets both timers

### Exports
- `useAuth()` hook → `{ user, loading, signInWithGoogle, handleSignOut, showInactivityWarning, resetInactivityTimer }`
- `AuthProvider` wraps the app in `main.tsx`

### App.tsx Shell
- Top bar: board title, user avatar/initials, presence dots for other users
- Conditionally renders Login vs Canvas based on auth state
- Calls `useBoard()` for presence list display
