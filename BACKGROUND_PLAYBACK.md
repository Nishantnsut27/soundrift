# PWA background playback

Soundrift uses one persistent browser audio element, Media Session controls,
Cache Storage, and a service worker. This repository builds the web app and
installable PWA.

## Buffer and storage policy

The player prepares **four upcoming songs for normal queues** and **eight for
playlists and albums**. These are sliding windows in playback order, including
shuffle and repeat. A finite queue prepares only the songs it has left;
repeat-one needs one file.

Preparation starts after current playback has a 20-second cushion or its
remaining audio is buffered. Downloads run sequentially over Wi-Fi or mobile
data, avoiding competition with the current stream. Automatic preparation
pauses when the browser reports Data Saver, a 2G connection, offline status,
or buffering. Browsers that do not expose network preferences cannot
communicate those settings to the PWA.

The automatic cache budget is **320 MiB**, with **24 MiB per file** and at most
**11 retained files**: eight upcoming, current, and two recent. Available
browser storage can reduce the buffer. The queue reports **contiguous**
readiness, so cached later songs do not hide a missing next song. The targets
do not imply that every file is ready as soon as Play is pressed.

Files become ready after a complete, validated download. Cache identity
includes provider, track ID, and quality rather than expiring URL parameters.
Source refreshes must match that identity. Retries are bounded, obsolete
requests are cancelled, and returning to the app or reconnecting refills the
window. Manually saved music is separate from automatic eviction.

## Playback and recovery

- `audioPreparation.ts` defines the preparation and storage policy.
- `trackPrefetch.ts` maintains the upcoming window and checks automatic and
  manually saved audio before using the network.
- `audioCache.ts` serializes cache mutations and observes quota.
- `offlineLibrary.ts` stores manual downloads and their local metadata.
- `playerPlayback.ts` owns the audio element, advancement, seeking, Media
  Session handlers, and bounded recovery.
- `playerRecommendations.ts` tops up eligible queues independently of React
  rendering.

The generated Workbox worker imports `public/audio-cache-worker.js`. It serves
the two local audio URL namespaces from Cache Storage only, with full
responses, open-ended and suffix byte ranges, clamped end offsets, and HTTP
416 for invalid ranges. Partial CDN responses are not treated as complete
cached songs.

A capability handshake prevents an older installed worker from receiving
local URLs it cannot serve. Without a capable worker, only the nearest two
prepared files use page Blob URLs. Readiness checks still cover the full
upcoming window and manually saved tracks.

The same audio element advances directly from media events and store
notifications. A missed handoff checks disk storage. A 20-second lack of
progress triggers bounded recovery; explicit Pause and denied autoplay are
respected. Position persistence is throttled and lifecycle events are logged.
Seeking uses the current audio position, clamps to track bounds, and preserves
paused playback.

Inspect the bounded local diagnostic log in the browser console:

```js
window.soundriftPlaybackDiagnostics()
```

It records visibility, media errors and recovery, readiness, and queue context
without CDN URLs or credentials.

## Browser limits

A PWA cannot guarantee continuous playback if the browser or operating system
freezes or discards its page. A service worker can serve cached bytes but
cannot own an audio element or run a permanent playback loop. Caching helps
with network suspension; it cannot override OS process management.
Sample-accurate gapless playback is not claimed.

The original phone interruption still needs a physical-device reproduction
and diagnostic logs to identify its cause. Desktop browser checks do not
prove uninterrupted playback on a locked phone.

## Build and verification

Use Node.js 22.12 or newer:

```sh
npm ci
npx eslint src vite.config.ts
npm run build
```

The workflow `.github/workflows/playback-validation.yml` runs source lint and
the PWA build.

At the project owner's request, root `tests/`, `vitest.config.ts`, and
`playwright.config.ts` remain local and excluded from Git. The npm test
commands and dependencies are available, but a clean checkout does not
contain those local test sources or configurations. CI therefore uses checks
that work from a clean checkout.

In a development workspace containing the local tests, also run:

```sh
npm test
npm run test:browser
```

Unit tests cover queue order and window sizes, cache limits, disk fallback,
retries, stale source reads, paused seeking, autoplay denial, and stall
recovery. Chrome integration tests cover offline cache/range behavior, cached
track advancement on one user-activated audio element, preparation through
the app's Play/Queue controls, playlist menus, and five-second seeking.

Browser tests use installed Chrome and the production build through Vite
preview. Build before running them. On a machine without Chrome, install it
with `npx playwright install --with-deps chrome`.

## Physical-device acceptance

Run on a real Android phone using Chrome and the installed PWA, and on an
iPhone using Safari and the installed PWA. Record OS/browser version, battery
mode, and the time of each interruption.

1. Play at least 25 tracks while locked. Check a fresh queue before its buffer
   fills and a queue reporting the full target ready. Confirm refill as tracks
   advance and when returning to the foreground.
2. After preparation, switch to airplane mode. Verify contiguous prepared
   tracks, available lock-screen controls, seeking, and clear failure at the
   first unavailable track. Reconnect and check refill and recovery.
3. Exercise shuffle, repeat-one/all, repeated songs, queue replacement, rapid
   skipping, clear queue, and Pause during a download or recovery.
4. Enable the browser's available data-saving settings, exhaust storage,
   interrupt a download, and test an expired URL. Confirm accurate readiness
   and bounded retries.
5. Save and remove manual downloads, then play saved tracks offline. Confirm
   automatic eviction preserves manually saved music.
6. Test calls, another audio app taking focus, headset/Bluetooth disconnection,
   and 30–60 minutes under battery restrictions. Respect user and OS pauses.
7. Close and reopen the PWA. Check restoration of paused playback without
   unwanted autoplay, then resume and verify the prepared window refills.

References: [Chrome page lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
and [Workbox media caching](https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video).