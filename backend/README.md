# Soundrift Backend

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-4.21-000000?logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-8.12-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Brevo](https://img.shields.io/badge/Email-Brevo-0D7CFF?logo=sendinblue&logoColor=white)](https://www.brevo.com)
[![JWT](https://img.shields.io/badge/Auth-JWT-000000?logo=jsonwebtokens&logoColor=white)](https://jwt.io)
[![Render](https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=white)](https://render.com)

> Drift Into Your Next Favorite. Express backend for the Soundrift streaming platform. Handles authentication, user data, music search from JioSaavn and Jamendo, and email notifications via Brevo.

---

## Features

**Auth** — JWT dual-token (access + refresh with rotation), OTP-based email verification, forgot/reset password, Remember Me, rate limiting.

**Music** — Search, trending, metadata (song/album/artist/playlist) with automatic JioSaavn → Jamendo fallback, in-memory caching, intelligent deduplication and noise filtering.

**User Data** — Favorites, playlists (CRUD + track reordering), recently played, listening history, search history, profile management, avatar upload (Cloudinary).

**Security** — HTTP-only cookies, Helmet, CORS, 7 rate limiters, bot protection, Zod validation, bcrypt hashing, request size limits.

---

## Tech Stack

Express 4.21 / TypeScript 5.8 (ESM) / MongoDB + Mongoose 8.12 / JWT / Brevo / Cloudinary / Zod / Multer / tsx

---

## Quick Start

```bash
cd backend
npm install
cp .env.example .env   # fill in your values
npm run dev             # http://localhost:5000
```

---

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | Server port |
| `MONGODB_URI` | — | MongoDB connection string |
| `MONGODB_DB_NAME` | `notify_music_player` | Database name |
| `JWT_SECRET` | — | Access token signing key |
| `JWT_EXPIRES_IN` | `15m` | Access token TTL |
| `REFRESH_TOKEN_SECRET` | — | Refresh token signing key |
| `REFRESH_TOKEN_EXPIRES_IN` | `7d` | Refresh token TTL |
| `COOKIE_SECRET` | — | Cookie signing secret |
| `BREVO_API_KEY` | — | Brevo transactional email API key |
| `EMAIL_FROM` | `notifymusicplayer@gmail.com` | Sender email |
| `EMAIL_FROM_NAME` | `Soundrift` | Sender name |
| `CLOUDINARY_CLOUD_NAME` | — | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | — | Cloudinary API secret |
| `JAMENDO_CLIENT_ID` | — | Jamendo API client ID |
| `JIOSAAVN_API_URL` | `https://notify-music-api.vercel.app` | JioSaavn proxy URL |
| `JAMENDO_API_URL` | `https://api.jamendo.com/v3.0` | Jamendo API URL |
| `ALLOWED_ORIGINS` | `http://localhost:5173,...` | CORS origins |
| `NODE_ENV` | `development` | `development` or `production` |

---

## API

### Health

```
GET /health → { status, database, environment, uptimeSeconds }
```

### Auth (`/api/auth`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/send-otp` | — | Send verification OTP (rate: 25/15m) |
| POST | `/resend-otp` | — | Resend OTP (rate: 5/60s) |
| POST | `/verify-otp` | — | Verify 6-digit OTP (rate: 5/60s) |
| POST | `/register` | — | Create account (email must be verified) (rate: 25/15m) |
| POST | `/login` | — | Login (rate: 25/15m) |
| POST | `/refresh` | — | Refresh + rotate tokens |
| POST | `/logout` | — | Clear tokens |
| POST | `/forgot-password` | — | Send reset OTP (rate: 5/15m) |
| POST | `/verify-reset-otp` | — | Verify reset OTP (rate: 5/60s) |
| POST | `/resend-reset-otp` | — | Resend reset OTP (rate: 5/60s) |
| POST | `/reset-password` | — | Set new password (rate: 5/15m) |
| GET | `/me` | Yes | Get current user |
| POST | `/change-password` | Yes | Change password |

### User (`/api/user`) — all require auth

| Method | Endpoint | Description |
|---|---|---|
| GET/PUT | `/profile` | Get/update profile |
| POST | `/avatar` | Upload avatar (multipart, max 5MB) |
| DELETE | `/account` | Delete account + all data |
| GET/POST | `/favorites` | List/add favorites |
| DELETE | `/favorites/:trackId` | Remove favorite |
| GET/POST | `/playlists` | List/create playlists |
| PUT/DELETE | `/playlists/:id` | Update/delete playlist |
| POST | `/playlists/:id/tracks` | Add track |
| DELETE | `/playlists/:id/tracks/:trackId` | Remove track |
| PUT | `/playlists/:id/tracks/reorder` | Reorder tracks |
| GET/POST | `/recently-played` | List/add |
| GET/POST | `/history` | List/record listening history |
| GET/POST/DELETE | `/search-history` | CRUD search history |

### Music (`/api/music`) — no auth required

| Method | Endpoint | Description |
|---|---|---|
| GET | `/search?q=&limit=` | Search songs (rate limited) |
| GET | `/trending` | Trending songs |
| GET | `/song/:id` | Song metadata |
| GET | `/album/:id` | Album details |
| GET | `/artist/:id` | Artist details |
| GET | `/playlist/:id` | Playlist details |
| GET | `/suggestions/:id` | Related songs |

### Response Format

```json
{ "success": true, "data": "...", "provider": "jiosaavn" }
{ "success": false, "error": "Error message" }
```

---

## Authentication Flow

**Signup:** Send OTP → Verify OTP → Register → Tokens returned as HTTP-only cookies + JSON body.

**Login:** Email + password → bcrypt verify → Tokens set as HTTP-only cookies.

**Token Refresh:** POST `/refresh` with cookie → JWT verify → bcrypt compare stored hash → rotate tokens.

**Forgot Password:** Send reset OTP → Verify OTP → Reset password (invalidates all sessions).

**Remember Me:** Frontend stores access token in `localStorage` (checked) or `sessionStorage` (unchecked). Refresh token always in HTTP-only cookie.

OTPs: 6-digit, bcrypt-hashed, 10-min expiry, 5 max attempts.

---

## Deployment (Render)

| Setting | Value |
|---|---|
| **Build** | `npm --prefix backend install && npm --prefix backend run build` |
| **Start** | `node backend/dist/index.js` |

Set all env vars via Render Dashboard. Cookies become `secure: true` automatically in production.

---

## License

MIT
