# 🚀 Quick Deployment Guide

## Step 1: Configure Firebase (5 minutes)

### Get Firebase Config Values

1. **Go to Firebase Console**: https://console.firebase.google.com/
2. **Select your project** (or create one)
3. **Enable Firestore**:
   - Click "Firestore Database" in left sidebar
   - Click "Create database"
   - Choose **"Start in test mode"** (allows all read/write for 30 days)
   - Select region: `us-central1` (or closest to you)
   - Click "Enable"

4. **Get Web App Config**:
   - Click the gear icon ⚙️ (Project Settings)
   - Scroll to "Your apps"
   - Click the `</>` (Web) icon
   - Register app name: "CollabBoard"
   - Copy the `firebaseConfig` object

5. **Create `.env` file** in project root:
   ```bash
   cp .env.example .env
   ```

6. **Paste your Firebase config** into `.env`:
   ```env
   VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
   VITE_FIREBASE_APP_ID=1:123456789012:web:abcdefghijk
   ```
7. **Set your WebRTC signaling server** (prod):
   ```env
   VITE_SIGNALING_SERVERS=wss://g4-collab-board.fly.dev
   ```

8. **Set your ICE (TURN) servers** for P2P connectivity through NAT/firewalls:
   ```env
   VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:your-turn-server:443?transport=tcp","username":"user","credential":"pass"}]
   VITE_ICE_TRANSPORT_POLICY=all
   ```
   > **Without TURN servers, WebRTC P2P sync will silently fail in production.**
   > STUN alone only works when both users are on the same network (e.g. local dev).
   > Users behind NAT or firewalls require a TURN relay. See `.env.example` for format details.

---

## Step 2: Test Locally (2 minutes)

```bash
# Start dev server
npm run dev
```

1. Open http://localhost:3000
2. Click **"Test Firestore Sync"** button (top-right)
3. Open same URL in another tab
4. Type messages and verify they sync in real-time
5. ✅ If syncing works, you're ready to deploy!

---

## Step 3: Deploy to Vercel (3 minutes)

### Option A: Vercel CLI (Fastest)

```bash
# Install Vercel CLI globally
npm i -g vercel

# Deploy
vercel

# Follow prompts:
# - Link to Vercel account (login via browser)
# - Confirm project settings
# - Wait for deployment (~30 seconds)

# Add environment variables
vercel env add VITE_FIREBASE_API_KEY production
# Paste your API key when prompted
# Repeat for all 6 environment variables:
vercel env add VITE_FIREBASE_AUTH_DOMAIN production
vercel env add VITE_FIREBASE_PROJECT_ID production
vercel env add VITE_FIREBASE_STORAGE_BUCKET production
vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID production
vercel env add VITE_FIREBASE_APP_ID production
vercel env add VITE_SIGNALING_SERVERS production   # wss://g4-collab-board.fly.dev
vercel env add VITE_ICE_SERVERS production          # JSON array with TURN credentials
vercel env add VITE_ICE_TRANSPORT_POLICY production # "all"

# Redeploy with environment variables
vercel --prod
```

**Your app is now live!** 🎉

### Option B: GitHub + Vercel Dashboard

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Initial commit: MVP scaffold"
   git push origin main
   ```

2. **Connect to Vercel**:
   - Go to https://vercel.com/new
   - Click "Import Project"
   - Select your GitHub repo
   - Vercel auto-detects Vite config

3. **Add Environment Variables**:
   - In Vercel dashboard, go to **Settings → Environment Variables**
   - Add all 6 `VITE_FIREBASE_*` variables
   - Add WebRTC vars: `VITE_SIGNALING_SERVERS`, `VITE_ICE_SERVERS`, `VITE_ICE_TRANSPORT_POLICY`
   - Set environment to: **Production, Preview, Development**

4. **Deploy**:
   - Click "Deploy"
   - Wait ~1 minute
   - Get your live URL: `https://your-project.vercel.app`

---

## Step 4: Verify Production Deployment

1. Open your Vercel URL
2. Click "Test Firestore Sync"
3. Open same URL on your phone or another device
4. Verify real-time sync works across devices
5. ✅ If syncing works, MVP infrastructure is complete!

---

## Troubleshooting

### "Permission denied" error in Firestore
**Fix**: Ensure Firestore is in **test mode**
- Go to Firestore → Rules
- Paste this:
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} {
        allow read, write: if true;
      }
    }
  }
  ```
- Click "Publish"

### Environment variables not working on Vercel
**Fix**:
1. Check that variables are set for "Production" environment
2. Ensure variable names have `VITE_` prefix
3. Redeploy after adding variables (Vercel → Deployments → three dots → Redeploy)

### P2P cursors/shapes don't sync in production (WebRTC)
**Symptoms**: Debug panel shows 0 WebRTC peers, P2P gate RED, cursors only sync via Firestore fallback.
**Fix**:
1. Ensure `VITE_ICE_SERVERS` is set in Vercel with TURN server credentials (STUN alone doesn't work through NAT)
2. Ensure `VITE_SIGNALING_SERVERS` is set to `wss://g4-collab-board.fly.dev`
3. Set `VITE_ICE_TRANSPORT_POLICY=all`
4. **Redeploy** after adding env vars (Vercel → Deployments → Redeploy)
5. Check browser console for `[webrtcProvider] VITE_ICE_SERVERS not set` warning — if present, the env var isn't reaching the build

### Build fails on Vercel
**Fix**:
1. Check build logs in Vercel dashboard
2. Ensure `package.json` and `vite.config.js` are committed
3. Verify `vercel.json` is in repo root

---

## Next Steps After Deployment

✅ Infrastructure working
⬜ Add sticky note creation
⬜ Add real-time sticky note sync
⬜ Add multiplayer cursors
⬜ Add Google authentication
⬜ Add presence awareness

**Total setup time**: ~10 minutes
**MVP foundation**: Complete ✅
