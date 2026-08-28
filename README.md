# Soundrift

> Drift Into Your Next Favorite.

[Live Demo](https://www.soundrift.tech) · [Backend Health](https://notify-music.onrender.com/health) · [GitHub](https://github.com/Nishantnsut27/soundrift)

---

## Project Overview

Soundrift is a full-stack music discovery and streaming platform built with React 19 and an Express.js/Node.js backend. It combines multi-provider music discovery, personalized recommendations, curated discovery sections, authentication, cloud-synced user libraries, and a browser-based playback experience. JioSaavn is used as the primary music provider with Jamendo available as a fallback provider, while an AI-assisted curation pipeline generates and refreshes editorial-style discovery sections.

---

## Key Features

- **Authentication** — Email/password registration and login with JWT access and refresh tokens, OTP-based email verification, forgot/reset password flow, password change, Remember Me persistence, and optional Google OAuth sign-in
- **Music Discovery** — Multi-provider search with result filtering, normalization, deduplication, relevance ranking, trending discovery, and related-track recommendations
- **AI-Assisted Curation** — Curated sections including Trending Now, Editor's Picks, Fresh Releases, K-Pop, and Worldwide, refreshed through a scheduled Groq-powered curation engine with configurable fallback/backfill behavior
- **Playback Engine** — Singleton HTML5 audio playback with seeking, volume control, shuffle, repeat modes, Media Session API integration, and keyboard shortcuts
- **Library Management** — Favorites, playlists, playlist track management and reordering, recently played, listening history, and search history with authenticated cloud synchronization
- **Playlist Tools** — Create, rename, delete, add/remove/reorder tracks, and export playlists as JSON from the frontend
- **Audio Visualizer** — Real-time Canvas-based harmonic/frequency visualization during playback
- **PWA & Offline** — Installable progressive web app with service-worker support, cached assets/API behavior, and a dedicated offline page
- **Responsive Design** — Desktop sidebar navigation, mobile drawer navigation, adaptive layouts, lazy-loaded discovery views, and dark/light theme support
- **Profile & Media** — User profile management and avatar uploads backed by Cloudinary
- **Security** — Rate limiting, progressive slowdown, bot protection, Zod input validation, Helmet security headers, CORS enforcement, compressed responses, secure cookies, and request coalescing

---

## Multi-Provider & Discovery Engine

### Provider Architecture

The backend uses a sequential provider strategy:

1. **JioSaavn (Primary)** — Used for search and music metadata operations such as songs, albums, artists, playlists, and suggestions. Results are normalized, filtered for search noise, deduplicated, and ranked before being returned.

2. **Jamendo (Fallback)** — Used when the primary provider returns no usable results or encounters an error. Multiple Jamendo search strategies can be combined and deduplicated to improve fallback coverage.

```
Search / Detail Request
        │
        ├── JioSaavn ──→ Normalize ──→ Filter ──→ Deduplicate ──→ Rank ──→ Output
        │
        └── (empty/error) ──→ Jamendo ──→ Normalize ──→ Output
```

### Trending & Discovery

The `/api/music/trending` endpoint generates a rotating discovery feed from curated keyword data. Provider results are filtered and combined to create a varied selection of music, with backend caching used to reduce repeated provider requests.

### AI-Assisted Curated Sections

The `/api/music/curated` and `/api/music/curated/:section` endpoints expose persistent curated sections. The current section set is:

- **Trending Now**
- **Editor's Picks**
- **Fresh Releases**
- **K-Pop**
- **Worldwide**

The backend includes a Groq-powered curation service, stored curated-section data, refresh locks, and a scheduler. The scheduler operates in the `Asia/Kolkata` timezone, runs two curation cycles per day, refreshes sections at five-minute intervals, and can perform startup backfill for stale or missing sections. Up to six Groq API keys can be configured for resilient curation requests.

### Recommendations

The `/api/music/suggestions/:id` endpoint provides related-track recommendations using the provider layer and fallback behavior when the primary provider cannot return suitable results.

---

## Security & Protection Architecture

| Protection Layer | Implementation | Purpose |
|---|---|---|
| **JWT Authentication** | `jsonwebtoken` | Short-lived access tokens plus rotating refresh tokens via secure cookies/headers |
| **Password Hashing** | `bcrypt` | Secure password and OTP hash storage |
| **OTP Verification** | 6-digit bcrypt-hashed OTP | Email verification and password-reset verification flows |
| **Google OAuth** | `google-auth-library` | Optional authorization-code based Google sign-in |
| **Rate Limiting** | `express-rate-limit` | Separate limits for authentication, OTP, search, metadata, health, and password-reset operations |
| **Progressive Slowdown** | `express-slow-down` | Adds increasing delay after configured search request thresholds |
| **Bot Protection** | Custom middleware | Rejects suspicious requests and records IP violations |
| **Input Validation** | `zod` | Validates search queries, resource IDs, and authentication inputs |
| **Security Headers** | `helmet` | Applies standard HTTP security protections |
| **CORS Policy** | `cors` | Restricts cross-origin requests to configured allowed origins |
| **Body Size Limit** | Express body-parser limits | Prevents oversized request payloads |
| **Request Coalescing** | In-memory inflight maps | Prevents duplicate simultaneous provider work |
| **Refresh Token Rotation** | Auth service | Invalidates/rotates refresh tokens during token refresh |

---

## System Architecture

```
Frontend (React 19 + TypeScript + Zustand)
    ↓  HTTPS / REST
Backend (Express.js + Node.js + TypeScript)
    ↓
Music Provider Layer (JioSaavn → Jamendo)
    ↓
MongoDB + Mongoose
    ↓
Authentication (JWT + bcrypt + optional Google OAuth)
    ↓
AI Curation (Groq)
    ↓
Email Service (Brevo) + Avatar Storage (Cloudinary)
```

The frontend is a single-page application deployed on Vercel. It uses Zustand for client-side state and local persistence, communicates with the backend through REST APIs, supports PWA installation/offline behavior, and provides dedicated search, favorites, playlists, recently played, legal, authentication, and discovery experiences.

The backend runs on Express.js with MongoDB/Mongoose for persistent storage, Cloudinary for avatar uploads, Brevo for transactional email, JioSaavn and Jamendo for music data, and Groq for AI-assisted curated discovery. The default backend URL used by the frontend is configurable through `VITE_API_URL`.

---

## Tech Stack

| Domain | Technology |
|---|---|
| **Frontend** | React 19, TypeScript 5.9, Vite 7, Zustand 5, Lucide React, Sonner |
| **Backend** | Node.js, Express.js 4, TypeScript 5.8 |
| **Database** | MongoDB, Mongoose 8 |
| **Authentication** | JWT (`jsonwebtoken`), bcrypt, Google OAuth (`google-auth-library`) |
| **Email Service** | Brevo (`@getbrevo/brevo`) |
| **AI Curation** | Groq API, configurable Groq models and multiple API keys |
| **Music Providers** | JioSaavn (primary), Jamendo (fallback) |
| **File Upload** | Multer, Cloudinary |
| **Security** | Helmet, express-rate-limit, express-slow-down, CORS, secure cookies |
| **Validation** | Zod 4 |
| **PWA** | vite-plugin-pwa / service-worker support |
| **Frontend Tooling** | ESLint 9, TypeScript ESLint, Vite React plugin, TSX |
| **Deployment** | Vercel (frontend), Render (backend) |

---

## API Reference

| Group | Base Path | Description |
|---|---|---|
| **Health** | `GET /health` | Server status with database connection state and runtime information |
| **Auth** | `/api/auth/*` | Registration, login, logout, refresh, OTP flows, email verification, password reset/change, profile session, and Google OAuth |
| **User** | `/api/user/*` | Authenticated profile/avatar management, favorites, playlists, playlist tracks, recently played, listening history, and search history |
| **Music** | `/api/music/*` | Search, trending, curated sections, song/album/artist/playlist details, and track suggestions |

### Music Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/music/search` | Search music through the provider layer |
| `GET` | `/api/music/trending` | Fetch rotating trending/discovery content |
| `GET` | `/api/music/curated` | Fetch all curated discovery sections |
| `GET` | `/api/music/curated/:section` | Fetch a specific curated section |
| `GET` | `/api/music/song/:id` | Fetch song details |
| `GET` | `/api/music/album/:id` | Fetch album details |
| `GET` | `/api/music/artist/:id` | Fetch artist details |
| `GET` | `/api/music/playlist/:id` | Fetch playlist details |
| `GET` | `/api/music/suggestions/:id` | Fetch related-track recommendations |

---

## Installation & Local Setup

### Prerequisites

- Node.js v18+
- npm v9+
- MongoDB instance (local or Atlas)
- Optional: Google OAuth credentials for Google sign-in
- Optional: Groq API key(s) for AI-assisted curation
- Cloudinary credentials for avatar uploads
- Brevo credentials for transactional email

### Setup

```bash
git clone https://github.com/Nishantnsut27/soundrift.git
cd soundrift
npm install
cd backend
npm install
cp .env.example .env
cd ..
```

Edit `backend/.env` with the required MongoDB, JWT, refresh-token, cookie, and Cloudinary configuration. Configure Google OAuth, Brevo, and Groq variables when those features are enabled. The frontend can use `VITE_API_URL` to point to a local or alternate backend.

### Run

```bash
npm run backend    # Backend at http://localhost:5000
npm run dev        # Frontend at http://localhost:5173
```

### Production Build

```bash
npm run build
npm run backend:build
```

The backend can then be started with:

```bash
cd backend
npm start
```

---

## Environment Configuration

The backend reads its configuration from environment variables. Important groups include:

- **Server:** `PORT`, `NODE_ENV`, `CLIENT_URL`, `ALLOWED_ORIGINS`
- **Database:** `MONGODB_URI`, `MONGODB_DB_NAME`
- **Authentication:** `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_EXPIRES_IN`, `COOKIE_SECRET`
- **Google OAuth:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `FRONTEND_URL`
- **Music Providers:** `JIOSAAVN_API_URL`, `JAMENDO_API_URL`, `JAMENDO_CLIENT_ID`
- **AI Curation:** `GROQ_API_KEY_1` through `GROQ_API_KEY_6` (or legacy `GROQ_API_n`/`GROQ_API_KEY`), plus curation scheduler settings
- **Email:** `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME`
- **Media:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

Never expose backend secrets or Groq API keys through the Vite frontend.

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
