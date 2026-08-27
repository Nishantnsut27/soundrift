# Soundrift

> Drift Into Your Next Favorite.

[Live Demo](https://www.soundrift.tech) · [Backend Health](https://notify-music.onrender.com/health) · [GitHub](https://github.com/Nishantnsut27/soundrift)

---

## Project Overview

Soundrift is a full-stack music discovery and streaming platform with authentication, playlist management, and multi-provider audio discovery. The React 19 frontend communicates with an Express.js API that orchestrates music search across JioSaavn (primary) and Jamendo (fallback) providers with automatic failover, ensuring uninterrupted playback.

---

## Key Features

- **Authentication** — Email/password registration and login with JWT access and refresh tokens, OTP-based email verification, forgot/reset password flow, and Remember Me persistence
- **Music Discovery** — Multi-provider search engine with result deduplication and relevance ranking; trending content via Fisher-Yates shuffled discovery queue; personalized track recommendations
- **Playback Engine** — Singleton HTML5 audio with seek, volume, shuffle, repeat modes, Media Session API integration, and keyboard shortcuts
- **Library Management** — Favorites, playlists (create, rename, delete, add/remove tracks, import/export as JSON), recently played, and search history — synced to the cloud when authenticated
- **Audio Visualizer** — Real-time Canvas-based harmonic frequency visualization during playback
- **PWA & Offline** — Installable progressive web app with Workbox service worker; network-first API caching; cache-first asset caching; dedicated offline page
- **Responsive Design** — Desktop layout with persistent sidebar, mobile drawer navigation, and adaptive UI components
- **Security** — Rate limiting, progressive slow-down, bot protection with IP violation tracking, Zod input validation, Helmet headers, and CORS enforcement

---

## Multi-Provider & Discovery Engine

### Provider Architecture

The backend uses a **sequential fallback** strategy across two providers:

1. **JioSaavn (Primary)** — Queried for all search, track, album, artist, playlist, and suggestion requests. Results are filtered for quality (`isSearchNoise`), deduplicated by normalized title and duration similarity, and ranked by relevance score.

2. **Jamendo (Fallback)** — Open-license provider activated when JioSaavn returns zero results or throws an error. Fires three parallel queries (`namesearch`, `artist_name`, `tags`) and deduplicates results internally.

```
Search/Detail Request
        │
        ├── JioSaavn ── Success ──→ Filter ──→ Deduplicate ──→ Rank ──→ Output
        │
        └── (empty/error) ──→ Jamendo ──→ Output
```

### Trending & Discovery

The home endpoint (`GET /api/music/trending`) generates content from a **Fisher-Yates shuffled queue** of 79 curated keywords spanning Indian artists, movies, playlists, and international hits. Each request selects 4–6 random artists from a pool of 33, searches each via the provider chain, filters for artist-relevant results, and interleaves songs round-robin across artists. Results are cached for 45 seconds.

### Recommendations

The suggestions endpoint (`GET /api/music/suggestions/:id`) calls JioSaavn's related-tracks API and falls back to Jamendo genre-based recommendations when JioSaavn returns empty.

---

## Security & Protection Architecture

| Protection Layer | Implementation | Purpose |
|---|---|---|
| **JWT Authentication** | `jsonwebtoken` | Access (15 min) + Refresh (7 day) tokens via httpOnly cookies and Authorization header |
| **Password Hashing** | `bcrypt` | Secure password and OTP hash storage |
| **OTP Verification** | 6-digit bcrypt-hashed OTP | Email verification and password reset flows |
| **Rate Limiting** | `express-rate-limit` | Auth (25/15min), OTP (5/60s), forgot password (5/15min), search (300/min), metadata (600/min) |
| **Progressive Slowdown** | `express-slow-down` | +500ms delay per request after 100 search hits |
| **Bot Protection** | Custom middleware | Rejects missing User-Agent; tracks IP violations in-memory |
| **Input Validation** | `zod` | Search queries (1–100 chars), resource IDs (1–128), auth inputs |
| **Security Headers** | `helmet` | CSP, frameguard, X-Content-Type-Options, cross-origin resource policy |
| **CORS Policy** | `cors` | Dynamic origin whitelist with localhost auto-allow in development |
| **Body Size Limit** | `express.json({ limit: '10kb' })` | Prevents large-payload DoS |
| **Request Coalescing** | In-memory inflight map | Deduplicates simultaneous identical provider requests |
| **Token Rotation** | Refresh token rotation | Old tokens invalidated on each refresh |

---

## System Architecture

```
Frontend (React 19 + TypeScript + Zustand)
    ↓  HTTPS / REST
Backend (Express.js + Node.js)
    ↓
Music Providers (JioSaavn → Jamendo)
    ↓
Database (MongoDB + Mongoose)
    ↓
Authentication (JWT + bcrypt)
    ↓
Email Service (Brevo/Sendinblue)
```

The frontend is a single-page application deployed on Vercel. It uses Zustand for state management with localStorage persistence and communicates with the production backend at `https://notify-music.onrender.com` by default. Set `VITE_API_URL` to override this URL for local or alternate deployments. The backend runs on Express.js with MongoDB for persistent storage, Cloudinary for avatar uploads, and Brevo for transactional email.

---

## Tech Stack

| Domain | Technology |
|---|---|
| **Frontend** | React 19, TypeScript 5.9, Vite 7, Zustand 5, Lucide React, Sonner |
| **Backend** | Express.js 4, Node.js, TypeScript 5.8 |
| **Database** | MongoDB, Mongoose 8 |
| **Authentication** | JWT (jsonwebtoken), bcrypt |
| **Email Service** | Brevo (Sendinblue) |
| **Music Providers** | JioSaavn (primary), Jamendo (fallback) |
| **File Upload** | Multer, Cloudinary |
| **Security** | Helmet, express-rate-limit, express-slow-down |
| **Validation** | Zod 4 |
| **PWA** | vite-plugin-pwa, Workbox |
| **Deployment** | Vercel (frontend), Render (backend) |

---

## API Reference

| Group | Base Path | Description |
|---|---|---|
| **Health** | `GET /health` | Server status with database connection state |
| **Auth** | `/api/auth/*` | Register, login, logout, token refresh, OTP send/verify/resend, forgot/reset password, change password, profile |
| **User** | `/api/user/*` | Profile management, avatar upload, favorites, playlists, recently played, listening history, search history |
| **Music** | `/api/music/*` | Multi-provider search, trending, song/album/artist/playlist details, track suggestions |

---

## Installation & Local Setup

### Prerequisites
- Node.js v18+
- npm v9+
- MongoDB instance (local or Atlas)

### Setup

```bash
git clone https://github.com/Nishantnsut27/Notify-Music.git
cd Notify-Music
npm install
cd backend
npm install
cp .env.example .env
cd ..
```

Edit the backend `.env` file with your database URI, JWT secrets, and Cloudinary credentials. Optionally configure a frontend `.env` file with `VITE_API_URL` pointing to your backend.

### Run

```bash
npm run backend    # Backend at http://localhost:5000
npm run dev        # Frontend at http://localhost:5173
```

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
