# CollabBoard MVP

Real-time collaborative whiteboard with infinite canvas, built with React, Konva.js, and Firebase Firestore.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Firebase project created
- Vercel account (for deployment)

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Firebase:**
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Fill in your Firebase credentials in `.env`:
     ```env
     VITE_FIREBASE_API_KEY=your_api_key
     VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID=your_project_id
     VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
     VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
     VITE_FIREBASE_APP_ID=your_app_id
     ```

3. **Run development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000)

## 📦 Deploy to Vercel

### Option 1: Vercel CLI (Fastest)

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel
   ```
   - Follow prompts to link to your Vercel account
   - Add environment variables when prompted (or add them in Vercel dashboard)

3. **Set environment variables in Vercel:**
   ```bash
   vercel env add VITE_FIREBASE_API_KEY
   vercel env add VITE_FIREBASE_AUTH_DOMAIN
   vercel env add VITE_FIREBASE_PROJECT_ID
   vercel env add VITE_FIREBASE_STORAGE_BUCKET
   vercel env add VITE_FIREBASE_MESSAGING_SENDER_ID
   vercel env add VITE_FIREBASE_APP_ID
   ```

4. **Redeploy with environment variables:**
   ```bash
   vercel --prod
   ```

### Option 2: GitHub Integration (Recommended)

1. Push code to GitHub
2. Go to [Vercel Dashboard](https://vercel.com/new)
3. Import your GitHub repository
4. Add environment variables in Vercel settings
5. Deploy automatically on every push

## 🧪 Testing Firestore Sync

1. Run the app locally or open your deployed URL
2. Click "Test Firestore Sync" button in the top-right
3. Open the same URL in multiple browser tabs
4. Type messages and watch them sync in real-time across all tabs

## 🎨 Canvas Features (Current)

- **Pan**: Drag anywhere on canvas
- **Zoom**: Scroll wheel to zoom in/out
- **Demo shapes**: Static sticky note and circle (will be replaced with Firestore-synced objects)

## 📁 Project Structure

```
collabboard/
├── src/
│   ├── components/
│   │   ├── Canvas.jsx          # Konva canvas with pan/zoom
│   │   └── TestSync.jsx        # Firestore real-time sync demo
│   ├── firebase.js             # Firebase initialization
│   ├── App.jsx                 # Main app component
│   ├── App.css                 # Global styles
│   └── main.jsx                # React entry point
├── index.html
├── package.json
├── vite.config.js
├── vercel.json                 # Vercel deployment config
└── .env.example                # Environment variables template
```

## 🔥 Firebase Setup Checklist

### 1. Create Firebase Project
- Go to [Firebase Console](https://console.firebase.google.com/)
- Create new project or use existing

### 2. Enable Firestore
- Navigate to **Firestore Database**
- Click "Create database"
- Start in **test mode** (we'll add security rules later)
- Choose your region (us-central1 recommended)

### 3. Get Firebase Config
- Go to **Project Settings** (gear icon)
- Scroll to "Your apps"
- Click **Web** icon (`</>`)
- Register app (name: "CollabBoard")
- Copy the `firebaseConfig` object values to your `.env` file

### 4. Enable Authentication (Later)
- Navigate to **Authentication**
- Click "Get started"
- Enable **Google** sign-in provider

## 🔧 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite | Fast dev, modern React |
| **Canvas** | Konva.js + react-konva | 2D canvas rendering with pan/zoom |
| **Real-time** | Firebase Firestore | Zero-config WebSocket sync |
| **Hosting** | Vercel | Auto-deploy, zero config |

## 📊 Next Steps (MVP Features)

- [ ] Sticky note creation (double-click to create)
- [ ] Drag sticky notes to move
- [ ] Edit text content (double-click to edit)
- [ ] Color picker for sticky notes
- [ ] Real-time sync sticky notes via Firestore
- [ ] Multiplayer cursors
- [ ] Presence awareness
- [ ] Google authentication

## 🐛 Troubleshooting

### Firestore permission denied
- Check that Firestore is in **test mode** (allows read/write for 30 days)
- Go to Firestore > Rules and ensure:
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

### Environment variables not loading
- Ensure `.env` file is in project root (not in `src/`)
- Restart dev server after changing `.env`
- Prefix all variables with `VITE_` (Vite requirement)
- In Vercel, add environment variables in dashboard under Settings > Environment Variables

### Build fails on Vercel
- Check that all environment variables are set in Vercel dashboard
- Ensure `vercel.json` is committed to git
- Check build logs in Vercel dashboard for specific errors

## 📝 License

MIT
