import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
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

test('temporary progress failures retry the same job and return its completed result', async t => {
  for (const failure of ['network', 'timeout', 'server', 'rate_limit']) {
    await t.test(failure, async t => {
      reset();
      t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
      // Native AbortSignal timers are not controlled by MockTimers.
      t.mock.method(AbortSignal, 'timeout', (delay: number) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), delay);
        return controller.signal;
      });
      const requests: string[] = [];
      const urls: string[] = [];
      let polls = 0;
      const result = { playlist: { name: 'Prepared', tracks: [track] }, total: 1, duplicates: 0, missing: [] };
      t.mock.method(globalThis, 'fetch', async (input, init) => {
        const method = init?.method || 'GET'; requests.push(method);
        if (method === 'POST') return response({ id: 'retry-job' });
        if (method === 'DELETE') return response({});
        urls.push(String(input));
        if (++polls === 1) {
          if (failure === 'network') throw new TypeError('Connection dropped');
          if (failure === 'timeout') await new Promise((_resolve, reject) => {
            init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
          });
          return response({}, failure === 'server' ? 503 : 429);
        }
        assert.equal(requests.includes('DELETE'), false);
        return response({ status: 'complete', progress: { phase: 'matching', processed: 1, total: 1 }, result });
      });
      const pending = prepareSpotifyImport(link, new AbortController().signal, () => {});
      // Attach a handler immediately so regressions do not produce unhandled rejections.
      const completed = pending.then(value => ({ value }), error => ({ error }));
      await setImmediate();
      assert.deepEqual(requests, ['POST', 'GET']);
      if (failure === 'timeout') { t.mock.timers.tick(20_000); await setImmediate(); }
      t.mock.timers.tick(1200);
      assert.deepEqual(await completed, { value: result });
      assert.deepEqual(requests, ['POST', 'GET', 'GET', 'DELETE']);
      assert.equal(urls[0], urls[1]);
      assert.equal(usePlayerStore.getState().playlists.length, 0);
    });
  }
});

test('terminal progress errors are not retried', async t => {
  reset();
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    const method = init?.method || 'GET'; requests.push(method);
    return response(method === 'POST' ? { id: 'expired-job' } : {}, method === 'GET' ? 404 : 200);
  });
  await assert.rejects(prepareSpotifyImport(link, new AbortController().signal, () => {}), { status: 404 });
  assert.deepEqual(requests, ['POST', 'GET', 'DELETE']);
});

test('cancelling during retry backoff stops polling and releases the job', async t => {
  reset();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    const method = init?.method || 'GET'; requests.push(method);
    if (method === 'GET') throw new TypeError('Connection dropped');
    return response({ id: 'cancelled-job' });
  });
  const cancelled = prepareSpotifyImport(link, controller.signal, () => {}).then(() => null, error => error as Error);
  await setImmediate();
  assert.deepEqual(requests, ['POST', 'GET']);
  controller.abort();
  assert.equal((await cancelled)?.name, 'AbortError');
  t.mock.timers.tick(60_000);
  assert.deepEqual(requests, ['POST', 'GET', 'DELETE']);
});

test('repeated temporary failures stop at the existing import deadline', async t => {
  reset();
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_input, init) => {
    const method = init?.method || 'GET'; requests.push(method);
    if (method === 'GET') return response({}, 503);
    return response({ id: 'timed-out-job' });
  });
  const expired = prepareSpotifyImport(link, new AbortController().signal, () => {}).then(() => null, error => error as Error);
  await setImmediate();
  t.mock.timers.tick(11 * 60_000);
  assert.match((await expired)?.message || '', /took too long/);
  assert.deepEqual(requests, ['POST', 'GET', 'DELETE']);
});
