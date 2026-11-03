# Background playback implementation and validation

## Findings

The previous player already used one persistent audio element and Media Session
handlers. The concrete gaps were in preparation and recovery:

- Prefetch stopped at three songs, and the automatic cache held only six files
  or 80 MiB. At observed CDN file sizes of roughly 10–15 MB, this was a small buffer.
- Only one prepared source could be handed to the next song synchronously.
  A missed handoff looked in the manual offline library and then used the CDN,
  bypassing the automatic disk cache.
- Failed preparation normally waited for reconnect or a visibility change.
  A stream could remain in `waiting`/`stalled` without raising a media error.
- Audio uses Cache Storage, not IndexedDB. The service worker previously did
  not provide stable, cache-only media URLs with byte-range support.

These findings explain concrete ways playback could lose its buffer. They do
**not** identify which OS/browser event stopped the originally reported phone:
that requires a device reproduction and logs. Two sampled production CDN
responses supported CORS and ranges; there was no evidence of a universal CORS
failure.

## Configured behavior

The configured targets are **four upcoming songs for normal queues** and **eight
for playlists/albums**, following the revised requested sizes. They are sliding
windows in playback order, including shuffle and repeat behavior. A finite
queue only prepares the songs it actually has left. Repeat-one needs one file.

Downloads start automatically after current playback has a 20-second cushion
or its remaining audio is buffered. They run sequentially to avoid competing
with the current stream, over Wi-Fi and mobile data. Automatic preparation
pauses for Data Saver, offline status, or buffering. On the web, a reported 2G
connection is also treated conservatively. Browsers that do not expose Data
Saver cannot communicate that setting to a PWA; native iOS uses Low Data Mode.

The automatic budget is 320 MiB, with 24 MiB per file and at most 11 retained
files on the web (eight upcoming, current, two recent). Actual available storage
can reduce the buffer. The queue reports **contiguous** readiness, so a missing
next song is not hidden by successfully cached later songs. Targets are not a
claim that all files are ready the instant Play is pressed.

Files become ready only after a complete, validated download. Cache identity
includes provider, track ID, and quality, rather than expiring URL parameters.
Expired-source refreshes must match that identity. Automatic retries are
bounded, obsolete requests are cancelled, and returning to the app/reconnecting
refills the window. Manual downloads are separate from automatic eviction.

## Web/PWA path

`audioPreparation.ts` contains the shared policy. `trackPrefetch.ts` maintains
the window and resolves both automatic and manually saved audio before using
the network. `audioCache.ts` serializes cache mutations and observes quota.

`public/audio-cache-worker.js`, imported into the generated Workbox worker,
serves the two dedicated local audio URL namespaces from Cache Storage only.
It supports full responses, open-ended and suffix ranges, clamped end offsets,
and HTTP 416 for invalid ranges. Partial streamed CDN responses are never
treated as complete cached songs. A worker capability handshake prevents an
older installed worker from receiving local URLs it cannot serve. Without a
capable worker, only the nearest two prepared files use page Blob URLs.

The same persistent audio element advances directly from the media event/store
notification. Missed preparation still consults disk. A 20-second lack of
progress triggers bounded recovery; explicit Pause and denied autoplay are
respected. Position persistence is throttled, and lifecycle events are logged.

For a physical-device reproduction, inspect the bounded local log in the
browser console with `window.soundriftPlaybackDiagnostics()`. It records
visibility, media errors/recovery, readiness and queue context without CDN URLs
or credentials. It is diagnostic evidence, not background telemetry.

A PWA cannot guarantee continuous execution if its page is frozen or discarded.
A service worker can serve cached bytes but cannot own an audio element or
run a permanent playback loop. Caching helps with network suspension; it cannot
override OS process management. Sample-accurate gapless playback is not claimed.

## Native path

The optional Capacitor app projects are in `android/` and `ios/`. Installing the
PWA from a browser does **not** enable these engines: a built native app must be
installed. `native/playback/` is the local Capacitor plugin, and
`nativePlayback.ts` is its control adapter. The browser continues to use the
web engine.

- Android: Media3 ExoPlayer in a foreground `MediaSessionService` owns the full
  queue, notification/media controls, focus/noisy handling, local file lookup,
  retries, preparation, and recommendation top-up.
- iOS: an AVQueuePlayer in the native host owns playback and upcoming items,
  with the playback audio session, `UIBackgroundModes=audio`, remote commands,
  interruption handling, and URLSession downloads. Files use protection that
  permits access after the device's first unlock.
- Native manual downloads use a separate persistent library. Both native
  players read these files directly; they do not depend on WebView Cache Storage.
  PWA downloads and native-app downloads are separate installations/stores.
- Versioned, coalesced snapshots prevent stale native updates from undoing a
  newer Pause/selection and restore the live queue after a WebView reconnect.
  Native queue entry IDs remain distinct across reloads and repeated songs.

The native architecture removes the WebView from queue advancement. It does
not keep music playing after the user force-stops the entire Android app or
terminates the iOS app. These development wrappers still require native build
and device acceptance testing before release. Cloud listening history for
transitions while the WebView is absent is not currently replayed to the server;
native authentication/deep-link flows also need release validation.

## Build and verification

Use Node 22 or newer and `npm ci`.

```sh
npx eslint src vite.config.ts capacitor.config.ts
npm run build
npm run mobile:sync
```

The root `tests/`, `vitest.config.ts`, and `playwright.config.ts` are kept locally
and excluded from Git at the project owner's request. The npm test scripts and
dependencies remain available, but a clean checkout does not contain those
test sources or configurations. CI runs source lint, the web build, and native
build checks without depending on the local test suite.

In the development workspace that contains the local tests, also run:

```sh
npm test
npm run test:browser
```

The browser tests use installed Chrome. On a machine without it, first run
`npx playwright install --with-deps chrome`. The production build must precede
the browser test because it exercises the generated worker via Vite preview.

For Android, install JDK 21 and Android SDK 36, run `npm run mobile:sync`, then
run `./gradlew :app:assembleDebug :app:lintDebug` from `android/` (use
`gradlew.bat` on Windows). `npm run mobile:android` opens Android Studio.

For iOS, use a Mac with current Xcode, run `npm run mobile:sync`, then open with
`npm run mobile:ios`. A signing team is required to install on a physical phone.
The workflow `.github/workflows/playback-validation.yml` includes web checks,
an Android debug build/lint job and an unsigned iOS simulator build. It has not
been run remotely as part of this change.

Verified on this Windows workspace:

- 53 unit tests pass: queue order/window sizes, disk fallback, cache limits,
  retries, stale source reads, Pause/autoplay handling, stall recovery, and
  native adapter synchronization.
- TypeScript, targeted ESLint, and the production web build pass.
- Eight Chrome integration tests pass, including offline cache/range behavior, ten
  complete cached WAV tracks advancing on one user-activated audio element,
  and a test through the app's Play/Queue controls that fills the four-song
  buffer, slides it forward, and then advances offline to a cached successor.
  They also cover Top result/player playlist menus and five-second seeking.
  These are desktop browser tests, not real locked-phone tests.
- Capacitor recognizes the plugin for both platforms and synchronizes assets.

Android binaries and iOS binaries have **not** been compiled here: this host
does not have the Android SDK/JDK or Xcode. No native-device background playback
claim should be made until the build jobs and tests below pass.

## Recheck corrections

The second review reproduced and corrected additional defects:

- Deleting a persisted cache entry before its index loaded could leave it
  incorrectly marked ready. Deletion now waits for initialization.
- Without a capable worker, eight of ten manually saved songs could be
  downloaded again. Readiness checks now cover the entire window while keeping
  only the nearest two Blob URLs in memory. Storage exhaustion stops further
  speculative downloads, and manual downloads reject incomplete responses.
- Native Seek could overtake a queued track change, and a failed initial
  bridge connection made Retry ineffective. All web controls now use ordered
  configuration commands, and the connection can be retried.
- Native control updates now distinguish queue edits and explicit selection
  from volume, pause and seek. Routine controls preserve a track/queue that
  advanced natively before the WebView received its state update. Restored
  suppression, mute and volume settings are retained.
- iOS preserves a restored position before an AVPlayerItem exists, retains
  loaded audio on lock-screen resume, handles already-failed queued items, and
  cancels automatic downloads when playback is cleared. Recovery responses
  from obsolete commands cannot override newer playback.
- Native state notifications are suppressed while the app is backgrounded;
  the WebView retrieves current state on return. Android playback checkpoints
  are throttled to five seconds, with immediate writes for control/track changes.

JavaScript regressions above are covered by the expanded unit/browser suite.
Native engine changes have been source-reviewed but still require the native
build and device acceptance steps below.

## Required device acceptance tests

Run on a real Android phone (Chrome PWA and native app) and iPhone (Safari,
installed PWA, and native app). Record OS/browser version, battery mode and
time of every interruption.

1. Play at least 25 tracks while locked. Check a fresh queue before its buffer
   fills, and a queue reporting its complete target ready. Confirm refill as
   songs advance and when returning to the foreground.
2. After preparation, switch to airplane mode. Verify all contiguous prepared
   tracks, lock-screen Next/Previous, seeking, and clear failure at the first
   unavailable track. Reconnect and verify refill/retry.
3. Exercise shuffle, repeat-one/all, repeated songs, queue replacement, rapid
   skipping, clear queue, and Pause during a pending download/recovery.
4. Enable Data Saver/Low Data Mode, exhaust storage, interrupt a download, and
   test an expired URL. Confirm accurate readiness and bounded retry behavior.
5. Save/remove manual downloads and play saved tracks offline. Confirm sliding
   eviction never removes manual downloads.
6. Test calls, another audio app taking focus, headset/Bluetooth disconnection,
   and 30–60 minutes under battery restrictions. Respect user/OS pauses.
7. For native apps, reload/terminate only the WebView while audio plays and
   reconnect to the live queue. Separately force-stop the whole app: playback
   must stop, and relaunch must restore paused state rather than autoplay.

Platform references: [Chrome page lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api),
[Workbox media caching](https://developer.chrome.com/docs/workbox/serving-cached-audio-and-video),
[Android background playback](https://developer.android.com/media/media3/session/background-playback),
[Apple media playback configuration](https://developer.apple.com/documentation/avfoundation/configuring-your-app-for-media-playback).
