import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { prepareSpotifyImport } from '../../src/services/spotifyImportApi.js';
import { SpotifyImportService } from '../src/services/spotifyImportService.js';
import type { Song } from '../src/models/music.model.js';

const stored = new Map<string, string>();
const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value),
  removeItem: (key: string) => stored.delete(key) };
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true });
const { usePlayerStore } = await import('../../src/store/playerStore.js');
const { useAuthStore } = await import('../../src/store/authStore.js');

const track: Song = { id: 'catalogue-1', name: 'Song', artist_name: 'Singer', artist_id: 'artist', duration: 180,
  album_id: 'album', album_name: 'Album', image: '', album_image: '', audio: 'https://example.com/song.mp3', audiodownload: '', license_ccurl: '',
  provider: 'jiosaavn', musicinfo: { tags: { genres: [], instruments: [], vartags: [] } } };
const link = 'https://open.spotify.com/playlist/37i9dQZF1DX5Ejj0EkURtP';
const reset = () => { stored.clear(); useAuthStore.setState({ isAuthenticated: false, user: null }); usePlayerStore.setState({ playlists: [] }); };
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { 'Content-Type': 'application/json' } });

test('Spotify preparation output uses the real JSON import, validation, persistence and duplicate detection', async () => {
  reset();
  const service = new SpotifyImportService({ getPlaylist: async () => ({ id: 'source', name: 'Spotify collection', total: 2, tracks: [
    { id: 'spotify-track', title: 'Song', artists: ['Singer'], durationMs: 180_000, album: 'Album' }, null,
  ] }) }, async () => [track]);
  const prepared = await service.prepare(link, new AbortController().signal, () => {});
  usePlayerStore.getState().importPlaylist(JSON.stringify(prepared.playlist));
  const imported = usePlayerStore.getState().playlists[0];
  assert.equal(imported.name, 'Spotify collection');
  assert.equal(imported.tracks[0].id, 'catalogue-1');
  assert.equal(imported.tracks[0].audio, track.audio);
  assert.equal(typeof imported.tracks[0].addedAt, 'number');
  assert.equal(JSON.parse(stored.get('playlists')!)[0].id, imported.id);
  assert.throws(() => usePlayerStore.getState().importPlaylist(JSON.stringify(prepared.playlist)), /already exists/);
});

test('existing file JSON keeps its validation, unique naming, track filtering and 500-track limit', () => {
  reset();
  const store = usePlayerStore.getState();
  for (const json of ['broken json', 'null', '{}', '{"name":5,"tracks":[]}']) assert.throws(() => store.importPlaylist(json));
  store.importPlaylist(JSON.stringify({ name: 'Original', tracks: [null, {}, track], createdAt: 123 }));
  store.importPlaylist(JSON.stringify({ name: 'Original', tracks: [{ ...track, id: 'other-track' }] }));
  assert.deepEqual(usePlayerStore.getState().playlists.map(item => item.name), ['Original', 'Original (1)']);
  assert.equal(usePlayerStore.getState().playlists[0].createdAt, 123);
  assert.equal(usePlayerStore.getState().playlists[0].tracks.length, 1);
  store.importPlaylist(JSON.stringify({ name: 'Large JSON', tracks: Array.from({ length: 501 }, (_, i) => ({ ...track, id: `track-${i}` })) }));
  assert.equal(usePlayerStore.getState().playlists.at(-1)?.tracks.length, 500);
});

test('frontend preparation returns JSON and releases its completed job without creating a playlist', async () => {
  reset();
  const requests: string[] = [];
  const result = { playlist: { name: 'Prepared', tracks: [track] }, total: 1, duplicates: 0, missing: [] };
  const http = mock.method(globalThis, 'fetch', async (_input, init) => {
    const method = init?.method || 'GET'; requests.push(method);
    return response(method === 'POST' ? { id: 'job' } : method === 'GET' ? {
      status: 'complete', progress: { phase: 'matching', processed: 1, total: 1 }, result,
    } : {});
  });
  try {
    assert.deepEqual(await prepareSpotifyImport(link, new AbortController().signal, () => {}), result);
    assert.deepEqual(requests, ['POST', 'GET', 'DELETE']);
    assert.equal(usePlayerStore.getState().playlists.length, 0);
  } finally { http.mock.restore(); }
});

test('cancelling while job creation is in flight still cleans up, with no late import', async () => {
  reset();
  const controller = new AbortController();
  const requests: string[] = [];
  const http = mock.method(globalThis, 'fetch', async (_input, init) => {
    const method = init?.method || 'GET'; requests.push(method);
    if (method === 'POST') controller.abort();
    return response({ id: 'late-job' });
  });
  try {
    await assert.rejects(prepareSpotifyImport(link, controller.signal, () => {}));
    assert.deepEqual(requests, ['POST', 'DELETE']);
    assert.equal(usePlayerStore.getState().playlists.length, 0);
  } finally { http.mock.restore(); }
});

test('failed preparation releases its job and leaves the JSON store untouched', async () => {
  reset();
  const requests: string[] = [];
  const http = mock.method(globalThis, 'fetch', async (_input, init) => {
    const method = init?.method || 'GET'; requests.push(method);
    return response(method === 'POST' ? { id: 'failed-job' } : { status: 'failed', progress: { phase: 'retrieving', total: 0, processed: 0 }, error: 'Playlist is private.' });
  });
  try {
    await assert.rejects(prepareSpotifyImport(link, new AbortController().signal, () => {}), /private/);
    assert.deepEqual(requests, ['POST', 'GET', 'DELETE']);
    assert.equal(usePlayerStore.getState().playlists.length, 0);
  } finally { http.mock.restore(); }
});
