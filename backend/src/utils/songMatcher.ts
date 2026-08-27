import { Song } from '../models/music.model.js';
import { normalizeStringForSearch } from './musicSearch.js';

export interface SongMatch {
  song: Song;
  confidence: number;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return 0.82 * (shorter / longer) + 0.1;
  }

  const aTokens = new Set(a.match(/.{1,4}/g) || []);
  const bTokens = new Set(b.match(/.{1,4}/g) || []);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let shared = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) shared++;
  }

  return shared / Math.max(aTokens.size, bTokens.size);
}

export function findBestSongMatch(
  candidateTitle: string,
  candidateArtist: string,
  results: Song[],
  minConfidence: number
): SongMatch | null {
  const targetTitle = normalizeStringForSearch(candidateTitle) || candidateTitle.toLowerCase().replace(/\s+/g, '');
  const targetArtist = normalizeStringForSearch(candidateArtist) || candidateArtist.toLowerCase().replace(/\s+/g, '');

  let best: SongMatch | null = null;

  for (const song of results) {
    if (!song || !song.id || !song.audio) continue;

    const songTitle = normalizeStringForSearch(song.name) || (song.name || '').toLowerCase().replace(/\s+/g, '');
    const songArtist =
      normalizeStringForSearch(song.artist_name) || (song.artist_name || '').toLowerCase().replace(/\s+/g, '');

    const titleScore = similarity(targetTitle, songTitle);
    const artistScore = similarity(targetArtist, songArtist);

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
