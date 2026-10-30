import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Song } from '../src/models/music.model.js';
import { MusicNormalizer } from '../src/normalizers/musicNormalizer.js';
import { eligibleLiveTrack, mergeDiscoveryTracks, LiveCurationService } from '../src/services/liveCurationService.js';
import { extractWebCandidates, containsDate, type WebCandidate } from '../src/utils/liveCurationCandidates.js';
import { findStrictSongMatch } from '../src/utils/songMatcher.js';
import { buildWebQueries } from '../src/services/webCurationService.js';
import { indiaDate } from '../src/services/tavilyService.js';

const now = new Date('2026-10-30T02:00:00Z');
const song = (id: string, changes: Partial<Song> = {}): Song => ({
  id, name: `Song ${id}`, artist_name: 'Sample Singer', artist_id: 'artist', album_name: 'Album', album_id: 'album',
  album_image: '', image: '', audio: 'https://audio.example/song.mp4', audiodownload: '', license_ccurl: '',
  duration: 180, language: 'hindi', releaseDate: '2026-10-24', provider: 'jiosaavn',
  musicinfo: { tags: { genres: [], instruments: [], vartags: [] } }, ...changes
});
const candidate: WebCandidate = { title: 'New Song', artist: 'Sample Singer', language: 'hindi', sourceUrl: 'https://indianexpress.com/music/release',
  evidence: 'Sample Singer released New Song on 24 October 2026.', dateEvidence: '24 October 2026', date: '2026-10-24', kind: 'release' };
const sources = [{ url: candidate.sourceUrl, title: 'Music news', content: candidate.evidence }];

test('freshness requires an actual recent full date; trending can contain older hits', () => {
  for (const releaseDate of ['2025-10-24', '2026-11-01', '2026-02-30', '2026', '']) {
    assert.equal(eligibleLiveTrack(song('1', { releaseDate }), 'fresh_releases', '2026-10-30'), false);
  }
  assert.equal(eligibleLiveTrack(song('1'), 'fresh_releases', '2026-10-30'), true);
  assert.equal(eligibleLiveTrack(song('1', { releaseDate: '2001-01-01' }), 'trending', '2026-10-30'), true);
  for (const changes of [{ language: 'english' }, { provider: 'jamendo' as const }, { audio: 'javascript:alert(1)' }, { duration: NaN }]) {
    assert.equal(eligibleLiveTrack(song('1', changes), 'trending', '2026-10-30'), false);
  }
  assert.equal(eligibleLiveTrack(song('1', { language: 'hariyanvi' }), 'trending', '2026-10-30'), true);
});

test('one malformed playlist entry does not discard valid dated tracks', () => {
  const playlist = MusicNormalizer.normalizeJioSaavnPlaylist({ id: 'p', name: 'Renamed playlist', songs: [null, 5,
    { id: 'bad', name: { malformed: true } },
    { id: 'good', name: 'Song', duration: 180, language: 'hindi', releaseDate: '2026-10-24', artists: { primary: [{ name: 'Singer', id: 'a' }] } }
  ] });
  assert.equal(playlist.tracks.length, 1);
  assert.equal(playlist.tracks[0].releaseDate, '2026-10-24');
});

test('web evidence must come from fetched text and explicitly support its full date', () => {
  const extract = (changes: Partial<WebCandidate> = {}) => extractWebCandidates(JSON.stringify({ songs: [{ ...candidate, ...changes }] }), sources, 'fresh_releases', '2026-10-30');
  assert.equal(extract().length, 1);
  for (const changes of [{ sourceUrl: 'https://invented.example/page' }, { evidence: 'Invented song release with a fake citation.' },
    { artist: 'Wrong Singer' }, { date: '2026-10-29' }, { kind: 'trend' as const }, { date: '2026-11-01' }]) assert.equal(extract(changes).length, 0);
  assert.equal(extractWebCandidates('not json', sources, 'fresh_releases', '2026-10-30').length, 0);
  assert.equal(containsDate('October 24th, 2026', '2026-10-24'), true);
  assert.equal(containsDate('24 October', '2026-10-24'), false);
});

test('release announcements do not qualify as trending evidence', () => {
  assert.deepEqual(extractWebCandidates(JSON.stringify({ songs: [candidate] }), sources, 'trending', '2026-10-30'), []);
});

test('strict matching rejects wrong artists, versions and ambiguous titles', () => {
  const target = song('1', { name: 'New Song' });
  assert.equal(findStrictSongMatch('New Song', 'Sample Singer', [target])?.song.id, '1');
  for (const changes of [{ name: 'New Song (Remix)' }, { artist_name: 'Other Artist' }, { name: 'Entirely Different' }]) {
    assert.equal(findStrictSongMatch('New Song', 'Sample Singer', [song('2', changes)]), null);
  }
});

test('strict matching rejects missing or different recording labels in either direction', () => {
  // A long base title must not let an unmatched label pass the fuzzy title threshold.
  for (const title of ['New Song', 'The Beautiful Song We Will Always Remember']) {
    for (const label of ['Radio Edit', 'Reprise', 'Alternate Take']) {
      for (const labelled of [`${title} (${label})`, `${title} [${label}]`]) {
        assert.equal(findStrictSongMatch(title, 'Sample Singer', [song('edit', { name: labelled })]), null, labelled);
        assert.equal(findStrictSongMatch(labelled, 'Sample Singer', [song('original', { name: title })]), null, labelled);
      }
    }
    for (const label of ['Radio Edit', 'Reprise']) {
      const labelled = `${title} - ${label}`;
      assert.equal(findStrictSongMatch(title, 'Sample Singer', [song('edit', { name: labelled })]), null, labelled);
      assert.equal(findStrictSongMatch(labelled, 'Sample Singer', [song('original', { name: title })]), null, labelled);
    }
  }
  assert.equal(findStrictSongMatch('New Song (Radio Edit)', 'Sample Singer', [song('reprise', { name: 'New Song (Reprise)' })]), null);
});

test('strict matching accepts the same recording label and selects the supported recording', () => {
  const original = song('original', { name: 'New Song' });
  for (const label of ['Radio Edit', 'Reprise', 'Alternate Take']) {
    const labelled = song('labelled', { name: `New Song [${label.toUpperCase()}]` });
    assert.equal(findStrictSongMatch(`New Song (${label})`, 'Sample Singer', [labelled])?.song.id, 'labelled');
    assert.equal(findStrictSongMatch(`New Song - ${label}`, 'Sample Singer', [labelled])?.song.id, 'labelled');
    for (const results of [[labelled, original], [original, labelled]]) {
      assert.equal(findStrictSongMatch('New Song', 'Sample Singer', results)?.song.id, 'original');
      assert.equal(findStrictSongMatch(`New Song (${label})`, 'Sample Singer', results)?.song.id, 'labelled');
    }
  }
});

test('live sections do not attach original recording evidence to radio edits or reprises', async () => {
  for (const section of ['trending', 'fresh_releases'] as const) {
    for (const label of ['Radio Edit', 'Reprise']) {
      const service = new LiveCurationService({
        getPlaylistById: async id => ({ id, name: 'Editorial', provider: 'jiosaavn', tracks: [song('base')] }),
        search: async () => [song('different-recording', { name: `New Song (${label})` })]
      }, { discover: async () => ({ candidates: [candidate], model: 'test', status: 'available', sourceCount: 1 }) });
      const result = await service.generate(section, now);
      assert.deepEqual(result.tracks.map(track => track.id), ['base']);
      assert(result.provenance.every(item => item.kind === 'editorial'));
      assert.equal(result.stats.unresolvedCount, 1);
    }
  }
});

test('agreement does not reorder editorial tracks; additions are unique and capped', () => {
  const editorial = Array.from({ length: 25 }, (_, index) => song(String(index)));
  const web = [editorial[24], ...Array.from({ length: 8 }, (_, index) => song(`web${index}`))];
  const merged = mergeDiscoveryTracks(editorial, web);
  assert.deepEqual(merged.slice(0, 20), editorial.slice(0, 20));
  assert.equal(merged.length, 25);
  assert.equal(merged.filter(track => track.id.startsWith('web')).length, 5);
  assert.deepEqual(mergeDiscoveryTracks(editorial, [editorial[24]]), editorial);
});

test('editorial fallback works without Groq/Tavily and retains language/date gates', async () => {
  const calls: string[] = [];
  const service = new LiveCurationService({
    getPlaylistById: async id => { calls.push(id); if (id === '6689255') throw new Error('Outage'); return { id, name: 'Renamed fallback', provider: 'jiosaavn', tracks: [song('good'), song('old', { releaseDate: '2020-01-01' })] }; },
    search: async () => { throw new Error('No web lookup expected'); }
  }, { discover: async () => { throw new Error('Tavily outage'); } });
  const result = await service.generate('fresh_releases', now);
  assert.deepEqual(calls, ['6689255', '1210453303']);
  assert.deepEqual(result.tracks.map(track => track.id), ['good']);
  assert.equal(result.webStatus, 'unavailable');
});

test('web candidates resolve to JioSaavn; an old catalogue date overrides a new announcement', async () => {
  const service = new LiveCurationService({
    getPlaylistById: async id => ({ id, name: 'Editorial', provider: 'jiosaavn', tracks: [song('base')] }),
    search: async query => [song(query.startsWith('Old Song') ? 'old' : 'new', { name: query.startsWith('Old Song') ? 'Old Song' : 'New Song', releaseDate: query.startsWith('Old Song') ? '2001-01-01' : undefined })]
  }, { discover: async () => ({ candidates: [candidate, { ...candidate, title: 'Old Song' }], model: 'test', status: 'available', sourceCount: 1 }) });
  const result = await service.generate('fresh_releases', now);
  assert.deepEqual(result.tracks.map(track => track.id), ['base', 'new']);
  assert.equal(result.provenance.filter(item => item.kind === 'web_release').length, 1);
});

test('queries cover all requested topics and derive dates in IST across year boundaries', () => {
  const time = new Date('2026-12-31T22:00:00Z');
  assert.equal(indiaDate(time), '2027-01-01');
  const queries = buildWebQueries('fresh_releases', time);
  assert.equal(queries.length, 4);
  for (const topic of ['Hindi', 'Bollywood', 'Punjabi', 'Haryanvi']) assert(queries.some(query => query.startsWith(topic)));
  assert(queries.every(query => query.includes('2026-12-25 to 2027-01-01')));
});
