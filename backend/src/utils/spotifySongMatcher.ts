import type { Song } from '../models/music.model.js';
import type { SpotifyTrackMetadata } from '../providers/spotifyPlaylistProvider.js';
import { findStrictSongMatch } from './songMatcher.js';

/** Remove catalogue annotations, while retaining the words that identify a recording/version. */
export function spotifySearchTitle(title: string): string {
  return title.normalize('NFKC')
    // Quoted movie names can themselves contain parentheses (e.g. Kapoor & Sons (Since 1921)).
    .replace(/\bfrom\s+["“][^"”]+["”]/giu, '')
    // Some Spotify releases have a missing closing quote: (From "Jackpot).
    .replace(/[([]\s*from\s+["“]?[^()[\]]*[)\]]/giu, '')
    .replace(/[([]\s*(?:feat(?:uring)?\.?|ft\.?)\s+[^()[\]]*[)\]]/giu, '')
    .replace(/\s+(?:feat(?:uring)?\.?|ft\.?)\s+.+$/giu, '')
    .replace(/([([])\s*[/,-]\s*/gu, '$1')
    .replace(/\(\s*\)|\[\s*\]/gu, '')
    .replace(/\s*[-–—/]\s*$/gu, '')
    .replace(/\s*(?:[-–—]\s*title\s+track|\(title\s+track\)|\[title\s+track\])\s*$/giu, '')
    .replace(/\b(acoustic|live|instrumental|unplugged|original|studio)\s+version\b/giu, '$1')
    .replace(/\s+/gu, ' ').trim();
}

function artistKey(name: string): string {
  // Preserve each complete credit: Vishal-Shekhar and Vishal & Shekhar are the same duo.
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\band\b/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
}

function artistKeys(names: string[]): string {
  return [...new Set(names.map(artistKey).filter(Boolean))].sort().join(', ');
}

function recordingSignature(title: string): string {
  return [...new Set(title.toLowerCase().match(/\b(?:female|male|duet|solo|acoustic|unplugged|live|remix|mashup|slowed|reverb|karaoke|instrumental|cover|reprise|remaster(?:ed)?|sped[ -]?up|lo[ -]?fi|radio[ -]?edit|vocals?\s+only|jhankar)\b/gu) || [])]
    .map(label => label.replace(/[^a-z]/g, '')).sort().join('|');
}

function titleKey(title: string): string {
  return title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function albumKey(album: string): string {
  return titleKey(spotifySearchTitle(album).replace(/\(?original\s+(?:(?:motion\s+picture|film)\s+)?soundtrack\)?/giu, ''));
}

function sameArtistSpelling(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 8 || Math.abs(a.length - b.length) > 1) return false;
  let left = 0;
  let right = 0;
  let edits = 0;
  while (left < a.length && right < b.length) {
    if (a[left] === b[right]) { left++; right++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) left++;
    if (b.length >= a.length) right++;
  }
  return edits + (a.length - left) + (b.length - right) <= 1;
}

function featuredArtists(title: string): string[] {
  return [...title.matchAll(/[([]\s*(?:feat(?:uring)?\.?|ft\.?)\s+([^()[\]]+)[)\]]/giu)]
    .flatMap(match => match[1].split(/,|\s+&\s+/u)).map(name => name.trim()).filter(Boolean);
}

export function findSpotifySongMatch(source: SpotifyTrackMetadata, songs: Song[]): Song | null {
  const title = spotifySearchTitle(source.title);
  const artists = artistKeys(source.artists);
  if (!title || !artists) return null;
  const wanted = new Set(source.artists.map(artistKey).filter(Boolean));
  const album = albumKey(source.album);
  const targetVersion = recordingSignature(title);
  const targetTitle = titleKey(title);
  const candidates = songs.flatMap(song => {
    if (!song || !/^https?:\/\//i.test(song.audio) || !Number.isFinite(song.duration) || song.duration <= 0 ||
        (source.durationMs > 0 && Math.abs(song.duration * 1000 - source.durationMs) > Math.max(10_000, source.durationMs * 0.06))) return [];
    let name = spotifySearchTitle(song.name);
    const credits = [...(song.artists?.length ? song.artists.map(artist => artist.name) : song.artist_name.split(/[,;]/)), ...featuredArtists(song.name)];
    const keys = [...new Set(credits.map(artistKey).filter(Boolean).map(key =>
      [...wanted].find(expected => sameArtistSpelling(key, expected)) || key))];
    const known = keys.filter(key => wanted.has(key));
    const unknown = keys.filter(key => !wanted.has(key)).sort();
    // Spotify credits do not identify roles. A shared composer/lyricist cannot justify
    // replacing another credit with a different singer. Permit omitted or added credits
    // only when one complete credit set agrees with the other (after normalization).
    if (!known.length || (unknown.length > 0 && known.length < wanted.size)) return [];
    const sameAlbum = !!album && albumKey(song.album_name) === album;
    const delta = source.durationMs ? Math.abs(song.duration * 1000 - source.durationMs) : Infinity;
    const version = recordingSignature(name);
    // A catalogue can explicitly label the original solo recording "Male" (e.g. Sunn Raha Hai).
    // This requires the same album, sole credited artist and near-exact duration, never just the composer.
    if (!targetVersion && /^(?:male|female)$/.test(version) && keys.length === 1 && known.length === 1 && sameAlbum && delta <= 2000) {
      name = name.replace(/\s*(?:\((?:male|female)(?:\s+version)?\)|[-–—]\s*(?:male|female)(?:\s+version)?)\s*$/iu, '').trim();
    }
    if (recordingSignature(name) !== targetVersion) return [];
    const candidate = { ...song, name, artist_name: keys.sort().join(', ') };
    const match = findStrictSongMatch(title, artists, [candidate], ['jiosaavn', 'jamendo']);
    if (!match) return [];
    const score = match.confidence
      + (titleKey(name) === targetTitle ? 0.06 : 0)
      + (sameAlbum ? 0.06 : 0)
      + 0.04 * known.length / Math.max(1, wanted.size)
      - 0.16 * unknown.length / Math.max(1, keys.length)
      + (delta <= 2000 ? 0.05 : 0)
      + (source.durationMs ? 0.04 * Math.max(0, 1 - delta / Math.max(10_000, source.durationMs * 0.06)) : 0);
    return [{ song, score, title: titleKey(name), unknown: unknown.join(','), keys, known }];
  }).sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return null;
  const alternative = candidates.find(candidate => {
    if (candidate === best) return false;
    const sameCredits = candidate.keys.join(',') === best.keys.join(',');
    // Album/compilation copies can differ by a few seconds of leading/trailing silence.
    // Only identical credits allow this wider duration tolerance.
    if (candidate.title !== best.title || Math.abs(candidate.song.duration - best.song.duration) > (sameCredits ? 5 : 2)) return true;
    const containedCredits = candidate.keys.every(key => best.keys.includes(key)) || best.keys.every(key => candidate.keys.includes(key));
    // A shorter credit list may omit composers/lyricists. Conflicting guest credits remain ambiguous.
    return !((candidate.unknown === '' && best.unknown === '') || sameCredits || containedCredits ||
      candidate.keys.filter(key => best.keys.includes(key)).length >= 3);
  });
  if (alternative && best.score - alternative.score < 0.05) return null;
  // Keep the original catalogue identifiers, display credits, artwork and playable audio.
  return best.song;
}

export function spotifySearchQueries(source: SpotifyTrackMetadata): string[] {
  const title = spotifySearchTitle(source.title);
  return [...new Set([
    ...source.artists.slice(0, 2).map(artist => `${title} ${artist}`),
    title,
    source.title,
  ].map(query => query.trim().slice(0, 180)).filter(Boolean))];
}
