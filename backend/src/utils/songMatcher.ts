import { Song } from '../models/music.model.js';
import { normalizeStringForSearch } from './musicSearch.js';

export interface SongCandidate { title: string; artist: string; reason: string }
export interface SongMatch { song: Song; confidence: number }

const similarity = (left: string, right: string): number => {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.82;
  const leftTerms = new Set(left.match(/[a-z0-9]+/g) || []);
  const rightTerms = new Set(right.match(/[a-z0-9]+/g) || []);
  const shared = [...leftTerms].filter(term => rightTerms.has(term)).length;
  return shared / Math.max(leftTerms.size, rightTerms.size, 1);
};

export function findBestSongMatch(candidate: SongCandidate, songs: Song[]): SongMatch | null {
  const title = normalizeStringForSearch(candidate.title);
  const artist = normalizeStringForSearch(candidate.artist);
  let best: SongMatch | null = null;
  for (const song of songs) {
    const titleScore = similarity(title, normalizeStringForSearch(song.name));
    const artistScore = similarity(artist, normalizeStringForSearch(song.artist_name));
    const confidence = titleScore * 0.7 + artistScore * 0.3 + (song.provider === 'jiosaavn' ? 0.02 : 0);
    if ((!best || confidence > best.confidence) && song.audio) best = { song, confidence: Math.min(confidence, 1) };
  }
  return best;
}
