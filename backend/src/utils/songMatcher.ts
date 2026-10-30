import { Song } from '../models/music.model.js';
import { normalizeStringForSearch } from './musicSearch.js';

export interface SongMatch {
  song: Song;
  confidence: number;
}

function bigrams(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index++) {
    const pair = value.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

/** Dice coefficient over character bigrams, so a one-letter spelling difference only dents the score. */
function diceSimilarity(a: string, b: string): number {
  const aPairs = bigrams(a);
  const bPairs = bigrams(b);
  const total = Math.max(0, a.length - 1) + Math.max(0, b.length - 1);
  if (total === 0) return 0;

  let shared = 0;
  for (const [pair, count] of aPairs) {
    shared += Math.min(count, bPairs.get(pair) ?? 0);
  }
  return (2 * shared) / total;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return 0.82 * (shorter / longer) + 0.1;
  }

  return diceSimilarity(a, b);
}

function normalizeName(value: string): string {
  return normalizeStringForSearch(value) || (value || '').toLowerCase().replace(/\s+/g, '');
}

function splitArtists(value: string): string[] {
  return (value || '')
    .split(/,|&|\band\b|\bfeat\.?|\bft\.?/i)
    .map(name => normalizeName(name))
    .filter(Boolean);
}

/** Best pairing between the suggested artists and the song's credited artists. */
function artistSimilarity(candidateArtist: string, songArtist: string): number {
  const wanted = splitArtists(candidateArtist);
  const credited = splitArtists(songArtist);
  let best = similarity(normalizeName(candidateArtist), normalizeName(songArtist));
  for (const name of wanted) {
    for (const other of credited) {
      best = Math.max(best, similarity(name, other));
    }
  }
  return best;
}

export function findBestSongMatch(
  candidateTitle: string,
  candidateArtist: string,
  results: Song[],
  minConfidence: number,
  minArtistSimilarity = 0
): SongMatch | null {
  const targetTitle = normalizeName(candidateTitle);
  const hasTargetArtist = Boolean(normalizeName(candidateArtist));

  let best: SongMatch | null = null;

  for (const song of results) {
    if (!song || !song.id || !song.audio) continue;

    const titleScore = similarity(targetTitle, normalizeName(song.name));
    const artistScore = hasTargetArtist ? artistSimilarity(candidateArtist, song.artist_name) : 0;
    if (hasTargetArtist && artistScore < minArtistSimilarity) continue;

    let confidence = titleScore * 0.7 + artistScore * 0.3;

    if (song.provider === 'jiosaavn') {
      confidence += 0.02;
    }

    if (!best || confidence > best.confidence) {
      best = { song, confidence };
    }
  }

  if (!best || best.confidence < minConfidence) {
    return null;
  }

  return best;
}

/** Unlike search normalization, retain parenthetical text and recording labels. */
function normalizeStrictTitle(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function recordingLabels(value: string): string {
  return [...new Set([...value.matchAll(/\(([^()]*)\)|\[([^\[\]]*)\]/g)]
    .map(match => normalizeStrictTitle(match[1] ?? match[2]))
    .filter(Boolean))].sort().join('|');
}

/** External web candidates must agree on title, artist and recording version independently. */
export function findStrictSongMatch(title: string, artist: string, results: Song[]): SongMatch | null {
  const version = (value: string): string => [...new Set(
    (value.toLowerCase().match(/\b(?:remix|mashup|slowed|reverb|lo[ -]?fi|live|cover|karaoke|instrumental|acoustic|unplugged|sped[ -]?up|remaster(?:ed)?|radio[ -]?edit|reprise)\b/g) || [])
      .map(normalizeStrictTitle)
  )].sort().join('|');
  const targetTitle = normalizeStrictTitle(title);
  const targetVersion = version(title);
  const targetLabels = recordingLabels(title);
  const matches = results.flatMap(song => {
    if (!song || song.provider !== 'jiosaavn' || !song.id || !song.audio || version(song.name) !== targetVersion) return [];
    const songTitle = normalizeStrictTitle(song.name);
    // Equal full titles may spell the same label with parentheses, brackets or a dash.
    // Otherwise require labels to agree even when a long base title is very similar.
    if (songTitle !== targetTitle && recordingLabels(song.name) !== targetLabels) return [];
    const titleScore = similarity(targetTitle, songTitle);
    const artistScore = artistSimilarity(artist, song.artist_name);
    const confidence = titleScore * 0.7 + artistScore * 0.3 + 0.02;
    if (titleScore < 0.85 || artistScore < 0.8 || confidence < 0.86) return [];
    return [{ song, confidence }];
  }).sort((a, b) => b.confidence - a.confidence);
  const first = matches[0];
  if (!first) return null;
  const alternative = matches.find(match =>
    normalizeStrictTitle(match.song.name) !== normalizeStrictTitle(first.song.name) ||
    normalizeName(match.song.artist_name) !== normalizeName(first.song.artist_name));
  return alternative && first.confidence - alternative.confidence < 0.05 ? null : first;
}
