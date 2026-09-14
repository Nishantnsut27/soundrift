# Soundrift 🎧

> **Drift Into Your Next Favorite.**

[![Live App](https://img.shields.io/badge/Live-soundrift.tech-black?style=flat-square)](https://www.soundrift.tech)
[![Backend](https://img.shields.io/badge/API-api.soundrift.tech-111827?style=flat-square)](https://api.soundrift.tech/health)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4-000000?style=flat-square&logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-8-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/)

Soundrift is a full-stack music discovery and streaming web app focused on fast catalogue search, personalized listening, persistent libraries, resilient music-provider fallbacks, and a polished browser playback experience.

## ✨ What Soundrift Includes

### Discover music
- Search across the Soundrift catalogue with normalized and deduplicated provider results.
- Explore **Trending**, **Discover**, **Genres**, **New Releases**, and curated sections.
- Open song, album, genre, and playlist detail views through shareable URL paths.
- Get related-track recommendations from the provider layer.

### Listen
- Singleton HTML5 audio player shared across the application.
- Queue management, seeking, volume control, shuffle, and repeat modes.
- Media Session integration for browser/OS media controls.
- Keyboard shortcuts for common playback actions.
- Real-time Canvas-based audio visualization.

### Personal library
Authenticated listeners can use:
- Favorites
- Playlists with create/update/delete and track add/remove/reordering
- Recently played / listening history
- Search history
- Cloud-synced profile and avatar

### Authentication
- Email/password sign-up and login.
- Email OTP verification and password-reset OTP flows.
- JWT access + refresh-token authentication with refresh rotation.
- Optional Google OAuth authorization-code flow.
- Remember-me behavior on the client.

### PWA & UX
- Installable Progressive Web App.
- Offline detection and dedicated offline experience.
- Responsive desktop/mobile navigation.
- Lazy-loaded views with chunk-reload handling.
- Protected routes for personal library pages.
- Legal pages for Terms and Privacy.

## 🧠 Discovery & Music Provider Architecture

Soundrift separates the frontend experience from external music providers through a backend provider layer.

```text
                         ┌───────────────┐
                         │ React + Vite  │
                         │  Soundrift UI │
                         └───────┬───────┘
                                 │ REST / HTTPS
                         ┌───────▼───────┐
                         │ Express API   │
                         │  TypeScript   │
                         └───────┬───────┘
                                 │
                 ┌───────────────┼────────────────┐
                 │               │                │
          ┌──────▼──────┐ ┌─────▼─────┐  ┌──────▼──────┐
          │  JioSaavn   │ │  Jamendo  │  │   Groq AI   │
          │   primary   │ │  fallback │  │  curation   │
          └──────┬──────┘ └─────┬─────┘  └─────────────┘
                 │               │
                 └───────┬───────┘
                         ▼
                 Normalize / Filter
                         ▼
                    Deduplicate
                         ▼
                       Rank
                         ▼
                  Soundrift client
```

### Provider strategy

**JioSaavn** is the primary provider for search and metadata. **Jamendo** is used as a fallback when the primary provider returns an error or no usable results. The backend normalizes provider-specific data into Soundrift's common music model before sending it to the frontend.

The music API currently exposes:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/music/search` | Search music |
| `GET` | `/api/music/trending` | Trending/discovery feed |
| `GET` | `/api/music/curated` | All curated sections |
| `GET` | `/api/music/curated/:section` | One curated section |
| `GET` | `/api/music/playlists/search` | Search playlists |
| `GET` | `/api/music/song/:id` | Song metadata |
| `GET` | `/api/music/album/:id` | Album details |
| `GET` | `/api/music/artist/:id/albums` | Artist album data |
| `GET` | `/api/music/playlist/:id` | Playlist details |
| `GET` | `/api/music/suggestions/:id` | Related tracks |

## 🤖 AI-Assisted Curation

Soundrift has a backend curation pipeline backed by Groq. Curated data is persisted in MongoDB rather than generated on every page request.

Current discovery sections include:

- **Trending Now**
- **Editor's Picks**
- **Fresh Releases**
- **K-Pop**
- **Worldwide**

The backend supports configurable curation prompts, section snapshots, refresh locks, stale-data detection, scheduled refreshes, and startup backfill. The scheduler is configured for the `Asia/Kolkata` timezone.

The curation controls are environment-driven, including the Groq model, refresh cron expressions, section size, snapshot TTL, match threshold, refresh interval, and startup refresh behavior.

## 🏗️ Project Structure

```text
soundrift/
├── src/
│   ├── components/       # UI, discovery pages, player, auth, library
│   ├── hooks/            # Search, recommendations, shortcuts, shared behavior
│   ├── pages/            # Legal pages
│   ├── pwa/              # Install and offline experiences
│   ├── services/         # REST client / music API integration
│   ├── store/            # Zustand state (player, auth, toast, etc.)
│   ├── styles/           # Global/component styles
│   └── App.tsx           # App shell + lightweight URL routing
│
├── backend/
│   ├── src/config/       # Runtime, DB, provider and curation configuration
│   ├── src/controllers/  # Auth, user, music and curation controllers
│   ├── src/middleware/   # Auth, validation, security, upload and rate limits
│   ├── src/models/       # Mongoose models
│   ├── src/routes/       # Auth, user, music and related routes
│   ├── src/services/     # Business logic, providers, curation and email
│   └── src/index.ts      # Express server entry point
│
├── public/               # Static/PWA assets
├── LICENSE
└── package.json
```

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 7 |
| State | Zustand 5 |
| UI | Lucide React, Sonner, custom CSS |
| PWA | `vite-plugin-pwa` / service worker |
| Backend | Node.js, Express 4, TypeScript |
| Database | MongoDB + Mongoose 8 |
| Auth | JWT, bcrypt, Google OAuth |
| Music | JioSaavn + Jamendo |
| AI | Groq API |
| Email | Brevo |
| Media uploads | Multer + Cloudinary |
| Security | Helmet, CORS, rate limiting, progressive slowdown, Zod validation |
| Deployment | Vercel frontend + Render backend |

## 🔐 Security

The backend applies several layers of protection around authentication and external provider traffic:

- HTTP-only refresh-token cookies with token rotation
- bcrypt password and OTP hashing
- Zod request validation
- Helmet security headers
- Configurable CORS allowlist
- Route-specific rate limiters
- Progressive slowdown for search traffic
- Bot/suspicious-request protection
- Express payload-size limits
- In-flight request coalescing for provider work
- Backend-only secrets for MongoDB, JWT, Groq, Cloudinary, Brevo, and provider credentials

## 🔌 Backend API

### Health

```text
GET /health
```

Returns server status, environment, uptime, and database connection information.

### Authentication — `/api/auth`

| Method | Endpoint | Auth |
|---|---|---|
| `POST` | `/send-otp` | Public |
| `POST` | `/resend-otp` | Public |
| `POST` | `/verify-otp` | Public |
| `POST` | `/register` | Public |
| `POST` | `/login` | Public |
| `POST` | `/refresh` | Public via refresh cookie |
| `POST` | `/logout` | Optional |
| `POST` | `/forgot-password` | Public |
| `POST` | `/verify-reset-otp` | Public |
| `POST` | `/resend-reset-otp` | Public |
| `POST` | `/reset-password` | Public |
| `POST` | `/verify-email` | Public |
| `GET` | `/google` | Public |
| `GET` | `/google/callback` | OAuth callback |
| `GET` | `/me` | Protected |
| `POST` | `/change-password` | Protected |

### User — `/api/user`

All user routes require authentication.

```text
GET    /profile
PUT    /profile
POST   /avatar
DELETE /account

GET    /search-history
POST   /search-history
DELETE /search-history/:query
DELETE /search-history

GET    /favorites
POST   /favorites
DELETE /favorites
DELETE /favorites/:trackId

GET    /playlists
POST   /playlists
PUT    /playlists/:id
DELETE /playlists/:id
POST   /playlists/:id/tracks
DELETE /playlists/:id/tracks/:trackId
PUT    /playlists/:id/tracks/reorder

GET    /recently-played
POST   /recently-played
GET    /history
POST   /history
```

## 🚀 Local Development

### Prerequisites

- Node.js 18+
- npm 9+
- A MongoDB database (local or Atlas)
- Provider credentials as required by the selected features
- Optional Google OAuth, Groq, Brevo, and Cloudinary configuration

### 1. Clone and install

```bash
git clone https://github.com/Nishantnsut27/soundrift.git
cd soundrift
npm install
cd backend
npm install
cd ..
```

### 2. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Fill in the required values in `backend/.env`. Keep all backend secrets server-side; do not put JWT, database, Groq, Cloudinary, Brevo, or provider secrets in Vite-exposed variables.

### 3. Start the development servers

From the repository root:

```bash
npm run backend
```

In another terminal:

```bash
npm run dev
```

Default local URLs:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:5000
Health:   http://localhost:5000/health
```

### 4. Build

```bash
npm run build
npm run backend:build
```

Production backend start:

```bash
cd backend
npm start
```

## ⚙️ Environment Variables

The full example is available in [`backend/.env.example`](backend/.env.example).

Important groups include:

```text
Server / CORS
  PORT, NODE_ENV, CLIENT_URL, ALLOWED_ORIGINS

Database
  MONGODB_URI, MONGODB_DB_NAME

Authentication
  JWT_SECRET, JWT_EXPIRES_IN
  REFRESH_TOKEN_SECRET, REFRESH_TOKEN_EXPIRES_IN
  COOKIE_SECRET, COOKIE_SECURE, COOKIE_SAME_SITE

OAuth
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  GOOGLE_CALLBACK_URL, FRONTEND_URL

Music providers
  JIOSAAVN_API_URL
  JAMENDO_API_URL, JAMENDO_CLIENT_ID

AI curation
  GROQ_API_KEY
  GROQ_DISCOVERY_MODEL
  DISCOVERY_TIMEZONE
  DISCOVERY_REFRESH_CRONS
  DISCOVERY_SECTION_SIZE
  DISCOVERY_SNAPSHOT_TTL_HOURS
  DISCOVERY_MATCH_THRESHOLD
  DISCOVERY_SECTION_INTERVAL_MINUTES
  DISCOVERY_REFRESH_ON_STARTUP

Email
  BREVO_API_KEY, EMAIL_FROM, EMAIL_FROM_NAME

Media
  CLOUDINARY_CLOUD_NAME
  CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
```

> **Security note:** `backend/.env.example` should contain placeholders only. Never commit real production secrets to Git.

## 🌐 Deployment

The current project is structured for a split deployment:

- **Frontend:** Vercel
- **Backend:** Render
- **Database:** MongoDB / MongoDB Atlas
- **Avatar storage:** Cloudinary
- **Transactional email:** Brevo

The deployed frontend points to the backend through `VITE_API_URL` (or the configured frontend API setting), while the backend receives its provider, database, authentication, and service credentials through environment variables.

## 🧪 Useful Scripts

### Frontend / root

```bash
npm run dev
npm run build
npm run lint
npm run preview
npm run backend
npm run backend:build
```

### Backend

```bash
cd backend
npm run dev
npm run build
npm start
npm run curate
```

`npm run curate` runs the backend curation script directly for manual refresh/testing.

## 📌 Implementation Notes

- The frontend uses a lightweight URL-routing layer in `App.tsx`; catalogue entity routes such as `/album/:id`, `/genre/:id`, and `/playlist/:id` preserve their IDs in the browser URL.
- Personal pages are protected client-side and backed by authenticated API routes on the server.
- `/recent` and `/recently-played` are maintained as history aliases in the frontend routing layer.
- Search is handled through a shared search engine hook so multiple search surfaces can reuse one debounced/in-flight request flow.
- Discovery data is cached/persisted on the backend to avoid regenerating curated content on every request.

## 📄 License

Soundrift is distributed under the MIT License. See [`LICENSE`](LICENSE) for details.

---

Built with React, TypeScript, Express, MongoDB, and a lot of music. 🎶
