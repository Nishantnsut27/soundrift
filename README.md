# Soundrift

**Drift Into Your Next Favorite.**

[![Live App](https://img.shields.io/badge/Listen-soundrift.tech-111827?style=flat-square)](https://www.soundrift.tech)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

Soundrift is a full-stack music discovery and streaming application. Search for songs, explore curated collections, follow recommendations, build a personal library, and save supported tracks for offline listening. A persistent player keeps music playing as you move between pages, and the installable web app brings the same experience to desktop and mobile.

**[Open Soundrift](https://www.soundrift.tech)**

[Features](#features) · [How it works](#how-soundrift-works) · [Project structure](#project-structure) · [Development](#development) · [Deployment](#deployment) · [Keyboard shortcuts](#keyboard-shortcuts)

## Features

### Discover something to play

- **Search:** Search songs and artists with debounced input, recent searches, cached results, and protection against older responses replacing a newer search.
- **Home:** Browse featured music and curated collections. Signed-in listeners also get a Continue Listening shelf and quick access to their library.
- **Trending:** Explore the curated Trending Now collection alongside an unranked selection of additional catalogue tracks.
- **Discover:** Open collections, start with a featured artist, or use Surprise Me to begin exploring. Follow a song into similar tracks and more music from its artist or album.
- **Genres:** Browse themed categories, moods, and eras backed by populated curated collections, alongside playlists from JioSaavn.
- **New Releases:** Find curated fresh songs and recent albums from featured artists, ordered using available release information.
- **Collection playback:** Open album and category details, play complete albums or playlists, and keep the selected collection together in the queue.

### Playback and queue controls

- Play, pause, seek, skip, adjust volume, and mute from a player shared across the application.
- Shuffle the queue or repeat one track or the entire queue.
- Use **Play Next**, append tracks, reorder upcoming entries, and remove individual occurrences of a song.
- Clear Up Next while the current song continues playing.
- Continue individual songs and discovery sections with automatic recommendations. Albums and playlists keep their own running order and finish at the end unless repeated.
- Control playback through supported browser and operating-system media controls, including lock-screen actions.
- Restore the last track and its position after a reload in the same browser tab; playback resumes when requested.
- See buffering status, playback errors, retry controls, and animated playback indicators.

### Personal library

Sign in to save favorites, create and rename playlists, add or remove songs, reorder playlist tracks, and revisit listening history. Playlists can also be imported and exported as JSON files.

Favorites, playlists, recent plays, and listening history synchronize with the account. Library edits appear immediately, with failed changes rolled back and reported to the listener. Recent searches are stored locally for guests and on the account for signed-in listeners.

### Accounts and sign-in

- Email and password registration with a six-digit verification code.
- Password recovery through an emailed code and a time-limited reset authorization.
- Google sign-in when configured.
- Remember-me support, automatic access-token refresh, and separate sessions for multiple devices.
- Account-scoped library handling when signing in, signing out, or changing accounts.

Browsing, playback, and the device's Offline Music library are available to guests. Favorites, personal playlists, and account history require sign-in.

### Offline listening and installation

Choose **Make available offline** from a song's menu or the player to save supported audio. The Offline Music page lists saved tracks, displays their storage usage, and lets you play them, remove individual saves, or clear the collection.

Saved audio uses browser Cache Storage, with track information in local storage. It belongs to the current browser and device, remains available after signing out, and does not synchronize between devices. Saving depends on the audio source permitting downloads, a supported audio response, and available browser storage; individual files are limited to 24 MiB. Clearing site data removes saved music.

Soundrift can be installed as a Progressive Web App in supported browsers. Its service worker caches the application shell and selected public resources. When connectivity is lost, the offline screen provides access to saved music while the player and queue remain available.

### Background playback

The PWA prepares a sliding buffer of four upcoming songs for normal queues and eight for playlists and albums. Complete audio files are cached within a 320 MiB automatic budget, separate from manually saved music. The queue shows how many consecutive upcoming songs are ready, and the service worker serves cached audio with byte-range support for playback and seeking.

One persistent browser audio element handles playback and Media Session controls. Caching and bounded recovery help playback through network interruptions, but a PWA cannot guarantee continued playback when the browser or operating system freezes or discards its page.

## How Soundrift Works

### Search and music providers

The React client sends music requests to an Express backend. JioSaavn is the primary catalogue provider, and Jamendo supplies fallback search results when the primary search fails or returns no usable results. Provider responses are converted into a shared track format; primary search results are also filtered, deduplicated, and ranked before reaching the interface.

The backend caches search and metadata results and shares concurrent requests for the same data. The client also caches repeated lookups and cancels superseded searches. Audio plays directly from the supplied media source or a saved browser copy.

Related-track recommendations combine provider suggestions with music from the same artist and album. The player excludes queued and recently played tracks when extending a listening session.

### Curated discovery

Discovery supports ten collections: **Trending Now**, **Editor's Picks**, **Fresh Releases**, **K-Pop**, **Worldwide**, **Golden Era Hindi**, **90s Bollywood**, **Monsoon Songs**, **After Midnight**, and **Morning Drive**. Collections appear when saved tracks are available.

Trending Now and Fresh Releases start with configured JioSaavn editorial playlists. Optional Tavily searches and Groq-assisted extraction add supported discoveries from trusted sources. These two collections focus on Hindi, Punjabi, and Haryanvi music. Web additions must match a real catalogue recording and include supporting source evidence. Matching checks the title, artist, and recording labels to reject unintended remixes, covers, or other versions. Fresh Releases also checks release dates against a recent-release window, which defaults to 30 days.

The other collections use Groq to propose songs, then resolve those suggestions against the music catalogue. Matching checks the title and artist, filters unresolved candidates, and reduces duplicate tracks within related collections. AI proposes catalogue selections; playback uses the matched provider tracks.

Curated snapshots are stored in MongoDB and served without generating new recommendations on each page request. The default refresh cycle begins daily at **03:00 Asia/Kolkata**, with sections spaced five minutes apart. Startup catch-up, bounded retries, and database refresh locks handle missed refreshes and competing server instances. Failed or undersized results preserve the previous collection.

### Playback continuity

In the browser, a single HTML audio element is controlled through the shared Zustand store. Queue entries have their own identities, so repeated copies of a song can be removed or reordered independently, and Previous follows the actual playback history.

When playback and connection conditions allow, Soundrift prepares up to four upcoming tracks for normal queues or eight for playlists and albums in a temporary audio cache. The browser cache is limited to 320 MiB and 11 files, including the current and recent tracks. It avoids starting these downloads on reported data-saving or 2G connections. This cache is managed separately from songs explicitly saved to Offline Music.

If a stream fails, the player attempts a bounded recovery sequence: retry the source, try an alternate URL when available, and request refreshed track metadata. Recovery preserves the playback position where possible. Background playback still depends on the browser and operating system's media policies.

## Technology

| Area | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript 5.9, Vite 7 |
| State and interface | Zustand 5, custom CSS, Lucide React, Sonner |
| Browser playback | HTMLAudioElement, Media Session API, Cache Storage |
| Progressive Web App | Vite PWA plugin, Workbox, web app manifest |
| Backend | Node.js, Express 4, TypeScript, Axios |
| Persistence | MongoDB with Mongoose 8 |
| Authentication | JWT, bcrypt, Google OAuth |
| Music catalogue | JioSaavn, Jamendo |
| Discovery | Groq, Tavily, persisted curation snapshots |
| Supporting services | Brevo for email, Cloudinary and Multer for avatar handling |
| Validation and protection | Zod, Helmet, CORS, request rate limits, progressive search slowdown |

## Project Structure

```text
soundrift/
├── src/
│   ├── components/      # Discovery views, player, authentication, and library
│   ├── hooks/           # Search, collection playback, and shared UI behavior
│   ├── services/        # API clients, audio playback, caching, and recommendations
│   ├── store/           # Shared player, library, authentication, and toast state
│   ├── pwa/             # Installation and offline experiences
│   ├── pages/           # Terms and privacy pages
│   ├── styles/          # Interface styles and design variables
│   └── App.tsx          # Application shell and URL routing
├── backend/
│   ├── src/config/      # Runtime, provider, and curation settings
│   ├── src/routes/      # Music, authentication, and account endpoints
│   ├── src/controllers/ # Request handling
│   ├── src/middleware/  # Authentication, validation, uploads, and rate limits
│   ├── src/models/      # MongoDB documents and provider track types
│   ├── src/providers/   # JioSaavn and Jamendo integrations
│   ├── src/services/    # Business logic, email, discovery, and scheduling
│   ├── src/scripts/     # Manual curation and discovery preview
│   └── tests/           # Curation matching and persistence tests
├── public/              # Icons and static web app assets
├── vite.config.ts       # Development server, build, and service worker
└── vercel.json          # Frontend navigation rewrites
```

## Development

Use **Node.js 22.12 or newer** and npm. Running the backend requires a reachable MongoDB database and configured authentication and Cloudinary credentials. Brevo is needed to deliver registration and password-reset emails. Google sign-in, Jamendo fallback, and AI/web-assisted discovery depend on their corresponding service configuration.

### 1. Install dependencies

Clone the repository and install both applications' dependencies:

```bash
git clone https://github.com/Nishantnsut27/soundrift.git
cd soundrift
npm install
npm install --prefix backend
```

### 2. Configure local development

Copy the frontend and backend examples to their respective environment files, then replace the placeholders:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Set the frontend's `.env` to use the local backend:

```dotenv
VITE_API_URL=http://localhost:5000
```

The backend example starts with production settings. For local HTTP development, set these values in `backend/.env`:

```dotenv
PORT=5000
NODE_ENV=development
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173
```

Configure the remaining backend values for the services you use:

| Configuration | Required for |
| --- | --- |
| `MONGODB_URI`, `MONGODB_DB_NAME` | Database connection; the database name has a default |
| `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `COOKIE_SECRET` | Server startup and authentication; use separate random secrets, with different access and refresh secrets |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Server startup and avatar storage |
| `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME` | Registration verification and password-reset email; use a verified sender |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | Optional Google sign-in; also requires `FRONTEND_URL` |
| `JIOSAAVN_API_URL` | Primary catalogue access; the example supplies the default provider URL |
| `JAMENDO_CLIENT_ID` | Optional Jamendo search fallback |
| `GROQ_API_1` through `GROQ_API_6`, `GROQ_CURATION_MODEL` | AI curation; at least one key enables the configured model |
| `TAVILY_API_KEY` | Optional web-assisted Trending Now and Fresh Releases discovery |

To disable Google sign-in, leave all three Google values empty, including the example's prefilled `GOOGLE_CALLBACK_URL`. To enable it locally, register `http://localhost:5000/api/auth/google/callback` as an authorized redirect URI and use it as the callback value.

The full settings are in [the frontend example](.env.example) and [the backend example](backend/.env.example). Backend credentials belong in `backend/.env`; variables prefixed with `VITE_` are exposed to the browser. Restart the development servers after changing environment files.

### 3. Start both applications

Start the frontend and backend in separate terminals from the repository root:

```bash
npm run dev
```

```bash
npm run backend
```

Open `http://localhost:5173` and check `http://localhost:5000/health` for the backend and database status. If Vite selects another port, update `ALLOWED_ORIGINS` and `FRONTEND_URL` to match. Without a `VITE_API_URL` override, the frontend uses `https://notify-music.onrender.com`.

### Available commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run backend` | Start the backend with automatic reloads |
| `npm run build` | Type-check and build the frontend, including PWA assets |
| `npm run backend:build` | Compile the backend |
| `npm run preview` | Preview the built frontend locally |
| `npm start --prefix backend` | Start the compiled backend |
| `npm run lint` | Run ESLint |
| `npm test --prefix backend` | Run the backend's curation tests |
| `npm run curate --prefix backend` | Refresh and persist curated collections manually |
| `npm run curate:preview --prefix backend` | Preview editorial/web discovery without replacing saved collections |

The curation preview uses configured external services and can consume search credits and update search caches. Existing tests cover matching, freshness checks, source evidence, search-budget accounting, concurrency, and preservation of previously saved collections.

Pass section IDs after `--` to limit a manual refresh or preview:

```bash
npm run curate --prefix backend -- trending fresh_releases
npm run curate:preview --prefix backend -- fresh_releases
```

Manual refresh supports all ten section IDs from [the curation configuration](backend/src/config/curationConfig.ts). Preview supports `trending` and `fresh_releases`.

## Deployment

The application supports separate frontend and backend hosting. The existing frontend configuration supports Vercel with single-page navigation rewrites, and the default hosted backend uses Render. Build the frontend as static assets and run the compiled backend as a Node.js service connected to MongoDB.

| Service | Build | Output or start command |
| --- | --- | --- |
| Frontend, repository root | `npm ci` then `npm run build` | Publish `dist/` |
| Backend, `backend/` directory | `npm ci` then `npm run build` | `npm start` |

Set `VITE_API_URL` to the deployed backend origin before building the frontend. On the backend, set `NODE_ENV=production`, `ALLOWED_ORIGINS`, and `FRONTEND_URL` for the deployed frontend. Cross-site HTTPS hosting requires `COOKIE_SECURE=true` and `COOKIE_SAME_SITE=none`. Production authentication secrets must each contain at least 32 characters. If Google sign-in is enabled, update its registered callback to the deployed backend's `/api/auth/google/callback` URL.

The backend process runs scheduled curation, so refresh timing depends on it being awake. Startup catch-up handles missed slots after restarts or host suspension. PWA installation and offline caching require a secure browser context, such as HTTPS or localhost.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play or pause |
| `Left Arrow` / `Right Arrow` | Seek backward or forward by five seconds |
| `Up Arrow` / `Down Arrow` | Increase or decrease volume by ten percentage points |
| `M` | Toggle mute |
| `S` | Toggle shuffle |
| `R` | Cycle repeat off, repeat all, and repeat one |

Global playback shortcuts apply on devices with a fine pointer and yield to text entry, modifier keys, and relevant focused controls.

## License

Licensed under the [MIT License](LICENSE). Copyright (c) 2026 Nishant Raj.
