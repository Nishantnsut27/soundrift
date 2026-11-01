import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import axios from 'axios';
import { SpotifyPlaylistProvider, parseSpotifyLink, parseSpotifyPage, type SpotifyTrackMetadata } from '../src/providers/spotifyPlaylistProvider.js';
import { SpotifyImportService, type ImportProgress } from '../src/services/spotifyImportService.js';
import { SpotifyImportJobs } from '../src/services/spotifyImportJobs.js';
import type { Song } from '../src/models/music.model.js';

const id = '37i9dQZF1DX5Ejj0EkURtP';
const link = `https://open.spotify.com/playlist/${id}`;
const signal = () => new AbortController().signal;
const entry = (index: number) => ({ uid: `entry-${index}`, itemV2: { data: {
  __typename: 'Track', uri: `spotify:track:${String(index).padStart(22, '0')}`, name: `Song ${index}`,
  artists: { items: [{ profile: { name: 'Singer' } }] }, trackDuration: { totalMilliseconds: 180_000 }, albumOfTrack: { name: 'Album' },
} } });
const page = (total: number, items: unknown[], extra = {}) => ({ data: { playlistV2: {
  uri: `spotify:playlist:${id}`, name: 'Imported collection', revisionId: 'revision-1', content: { totalCount: total, items }, ...extra,
} } });
const bootstrap = () => ({ status: 200, headers: {}, data: `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: { pageProps: { state: { settings: { session: { accessToken: 'anonymous-secret', isAnonymous: true, accessTokenExpirationTimestampMs: Date.now() + 3600_000 } } } } },
})}</script>` });

test('only Spotify playlist URLs, localized/embed URLs, URIs and Spotify short links are accepted', () => {
  for (const url of [link, `${link}?si=abc`, `https://open.spotify.com/intl-en/playlist/${id}/`,
    `https://open.spotify.com/embed/playlist/${id}`, `spotify:playlist:${id}`]) assert.deepEqual(parseSpotifyLink(url), { id });
  assert.deepEqual(parseSpotifyLink('https://spotify.link/Abc123?si=ignored'), { shortUrl: 'https://spotify.link/Abc123' });
  for (const url of [null, {}, '', 'http://127.0.0.1', `http://open.spotify.com/playlist/${id}`, `https://open.spotify.com.evil.test/playlist/${id}`,
    `https://evil@open.spotify.com/playlist/${id}`, `https://open.spotify.com:444/playlist/${id}`, `https://open.spotify.com/track/${id}`,
    'https://spotify.link/foo/bar', `${link}/extra`, 'javascript:alert(1)', 'x'.repeat(2049)]) assert.throws(() => parseSpotifyLink(url));
});

test('pagination counts every source item including unavailable entries, keeping metadata and order', async () => {
  const offsets: number[] = [];
  const http = mock.method(axios, 'get', async (url: string) => {
    if (url.includes('/embed/track/')) return bootstrap();
    const offset = JSON.parse(new URL(url).searchParams.get('variables')!).offset;
    offsets.push(offset);
    return { status: 200, headers: {}, data: page(150, Array.from({ length: offset === 0 ? 100 : 50 }, (_, i) => i + offset === 12 ? null : entry(i + offset))) };
  });
  try {
    const result = await new SpotifyPlaylistProvider().getPlaylist(link, signal());
    assert.deepEqual(offsets, [0, 100]);
    assert.equal(result.total, 150);
    assert.equal(result.tracks.length, 150);
    assert.equal(result.tracks[12], null);
    assert.deepEqual(result.tracks[149], { id: '0000000000000000000149', title: 'Song 149', artists: ['Singer'], durationMs: 180_000, album: 'Album' });
  } finally { http.mock.restore(); }
});

test('truncated, repeated, changing, oversized and malformed playlists never become a successful import', async () => {
  for (const variant of ['truncated', 'repeated', 'changed', 'oversized', 'malformed', 'private']) {
    let pages = 0;
    const http = mock.method(axios, 'get', async (url: string) => {
      if (url.includes('/embed/track/')) return bootstrap();
      pages++;
      let data: unknown = page(150, Array.from({ length: 100 }, (_, i) => entry(i)));
      if (variant === 'oversized') data = page(501, []);
      if (variant === 'malformed') data = { errors: [{ message: 'PersistedQueryNotFound' }], ...page(0, []) };
      if (variant === 'private') data = { data: { playlistV2: null } };
      if (pages === 2) {
        if (variant === 'truncated') data = page(150, []);
        if (variant === 'repeated') data = page(150, Array.from({ length: 50 }, (_, i) => entry(i)));
        if (variant === 'changed') data = page(150, [entry(100)], { revisionId: 'revision-2' });
      }
      return { status: 200, headers: {}, data };
    });
    try { await assert.rejects(new SpotifyPlaylistProvider().getPlaylist(link, signal()), undefined, variant); }
    finally { http.mock.restore(); }
  }
  assert.throws(() => parseSpotifyPage(page(-1, []), id));
  assert.throws(() => parseSpotifyPage(page(1, [], { uri: 'wrong-playlist' }), id));
});

test('short-link redirects cannot make requests to an untrusted server', async () => {
  const requests: string[] = [];
  const http = mock.method(axios, 'get', async (url: string) => {
    requests.push(url);
    return { status: 302, headers: { location: 'https://127.0.0.1/private' }, data: '' };
  });
  try {
    await assert.rejects(new SpotifyPlaylistProvider().getPlaylist('https://spotify.link/abc123', signal()));
    assert.deepEqual(requests, ['https://spotify.link/abc123']);
  } finally { http.mock.restore(); }
});

test('expired anonymous sessions refresh once; rate limits and network errors fail without exposing tokens', async () => {
  let bootstraps = 0;
  let pages = 0;
  const http = mock.method(axios, 'get', async (url: string) => {
    if (url.includes('/embed/track/')) { bootstraps++; return bootstrap(); }
    return { status: ++pages === 1 ? 401 : 200, headers: {}, data: page(1, [entry(0)]) };
  });
  try {
    assert.equal((await new SpotifyPlaylistProvider().getPlaylist(link, signal())).total, 1);
    assert.equal(bootstraps, 2);
    assert.equal(pages, 2);
  } finally { http.mock.restore(); }
  for (const failure of ['rate', 'network']) {
    const failing = mock.method(axios, 'get', async () => {
      if (failure === 'network') throw new Error('request header: anonymous-secret');
      return { status: 429, headers: {}, data: {} };
    });
    try {
      await assert.rejects(new SpotifyPlaylistProvider().getPlaylist(link, signal()), (error: Error) => !error.message.includes('anonymous-secret'));
      assert.equal(failing.mock.callCount(), 1);
    } finally { failing.mock.restore(); }
  }
});

const metadata = (title: string, trackId = title): SpotifyTrackMetadata => ({ id: trackId, title, artists: ['Singer'], durationMs: 180_000, album: 'Album' });
const song = (name: string, extra: Partial<Song> = {}): Song => ({ id: name, name, artist_name: 'Singer', artist_id: 'a', duration: 180,
  album_id: 'b', album_name: 'Album', album_image: 'https://example.com/art.jpg', image: '', audio: 'https://example.com/song.mp3',
  audiodownload: '', license_ccurl: '', provider: 'jiosaavn', musicinfo: { tags: { genres: [], instruments: [], vartags: [] } }, ...extra });
const source = (tracks: (SpotifyTrackMetadata | null)[]) => ({ getPlaylist: async () => ({ id, name: 'Imported collection', total: tracks.length, tracks }) });

test('partial imports retain ordered playable matches, deduplicate tracks and report every skipped item', async () => {
  const progress: ImportProgress[] = [];
  const service = new SpotifyImportService(source([metadata('Alpha'), metadata('Missing'), metadata('Beta'), metadata('Alpha'), null, metadata('Failure')]), async query => {
    if (query.startsWith('Failure')) throw new Error('upstream unavailable');
    if (query.startsWith('Missing')) return [];
    // Finish out of order, without reordering the resulting playlist.
    if (query.startsWith('Alpha')) await setImmediate();
    return [song(query.startsWith('Alpha') ? 'Alpha' : 'Beta')];
  });
  const result = await service.prepare(link, signal(), value => progress.push(value));
  assert.deepEqual(result.playlist.tracks.map(track => track.name), ['Alpha', 'Beta']);
  assert.equal(result.duplicates, 1);
  assert.deepEqual(result.missing.map(track => track.reason), ['not_found', 'unavailable', 'search_failed']);
  assert.equal(result.total, result.playlist.tracks.length + result.duplicates + result.missing.length);
  assert.deepEqual(progress.at(-1), { phase: 'matching', processed: 6, total: 6 });
  assert.equal(result.playlist.tracks[0].album_image, 'https://example.com/art.jpg');
});

test('matching rejects wrong artists, versions, durations, unsafe streams and ambiguous recordings', async () => {
  for (const candidates of [[song('Alpha', { artist_name: 'Wrong Artist' })], [song('Alpha (Remix)')], [song('Alpha', { duration: 30 })],
    [song('Alpha', { audio: 'javascript:alert(1)' })], [song('Alpha', { artist_name: 'Singer, Guest' }), song('Alpha', { id: 'second', artist_name: 'Singer, Other' })]]) {
    const service = new SpotifyImportService(source([metadata('Alpha')]), async () => candidates);
    await assert.rejects(service.prepare(link, signal(), () => {}), /None of these songs/);
  }
  const jamendo = new SpotifyImportService(source([metadata('Alpha')]), async () => [song('Alpha', { provider: 'jamendo' })]);
  assert.equal((await jamendo.prepare(link, signal(), () => {})).playlist.tracks[0].provider, 'jamendo');
});

test('empty sources, incomplete sources, no matches and cancellation do not produce import JSON', async () => {
  const empty = new SpotifyImportService(source([]), async () => []);
  await assert.rejects(empty.prepare(link, signal(), () => {}), /empty/);
  const incomplete = new SpotifyImportService({ getPlaylist: async () => ({ id, name: 'Incomplete', total: 5, tracks: [] }) }, async () => []);
  await assert.rejects(incomplete.prepare(link, signal(), () => {}), /complete/);
  const controller = new AbortController();
  const cancelled = new SpotifyImportService(source([metadata('Alpha')]), async () => { controller.abort(); return [song('Alpha')]; });
  await assert.rejects(cancelled.prepare(link, controller.signal, () => {}));
});

test('jobs enforce ownership, per-user concurrency and cancellation; completion exposes only the result', async () => {
  const service = new SpotifyImportService(source([metadata('Alpha')]), async () => { await setImmediate(); return [song('Alpha')]; });
  const jobs = new SpotifyImportJobs(service);
  const first = jobs.start('owner', link);
  assert.throws(() => jobs.start('owner', link), /already running/);
  assert.throws(() => jobs.get('other', first.id), /could not be found/);
  assert.throws(() => jobs.cancel('other', first.id), /could not be found/);
  for (let tick = 0; tick < 10 && jobs.get('owner', first.id).status === 'running'; tick++) await setImmediate();
  const result = jobs.get('owner', first.id);
  assert.equal(result.status, 'complete');
  assert.equal(result.result?.playlist.tracks.length, 1);
  assert.equal('owner' in result, false);
  assert.equal('controller' in result, false);
  jobs.cancel('owner', first.id);
  assert.throws(() => jobs.get('owner', first.id));
  const second = jobs.start('owner', link);
  jobs.cancel('owner', second.id);
  await setImmediate();
  assert.throws(() => jobs.get('owner', second.id));
});
