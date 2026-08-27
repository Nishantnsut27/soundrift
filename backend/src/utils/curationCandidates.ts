import { z } from 'zod';
import { normalizeStringForSearch } from './musicSearch.js';

export interface SongCandidate {
  title: string;
  artist: string;
}

export interface CandidateExtractionResult {
  candidates: SongCandidate[];
  rawCount: number;
  invalidCount: number;
  duplicateCount: number;
}

export class CandidateParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CandidateParseError';
  }
}

function extractJsonPayload(raw: string): string {
  let text = raw.trim();

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1].trim()) {
    text = fenceMatch[1].trim();
  }

  if (text.startsWith('{') || text.startsWith('[')) {
    return text;
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1).trim();
  }

  return text;
}

const candidateSchema = z
  .object({
    title: z.unknown().optional(),
    artist: z.unknown().optional()
  })
  .passthrough();

const responseSchema = z.object({
  songs: z.array(z.unknown())
});

function toCleanString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

export function buildCandidateKey(title: string, artist: string): string {
  const normalizedTitle = normalizeStringForSearch(title) || title.toLowerCase().replace(/\s+/g, '');
  const normalizedArtist = normalizeStringForSearch(artist) || artist.toLowerCase().replace(/\s+/g, '');
  return `${normalizedTitle}::${normalizedArtist}`;
}

export function extractCandidates(rawContent: string, limit: number): CandidateExtractionResult {
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    throw new CandidateParseError('LLM response was empty');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonPayload(rawContent));
  } catch {
    throw new CandidateParseError('LLM response was not valid JSON');
  }

  const structure = responseSchema.safeParse(parsed);
  if (!structure.success) {
    throw new CandidateParseError('LLM response did not contain a songs array');
  }

  const rawSongs = structure.data.songs;
  const seen = new Set<string>();
  const candidates: SongCandidate[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const entry of rawSongs) {
    if (candidates.length >= limit) break;

    const shape = candidateSchema.safeParse(entry);
    if (!shape.success) {
      invalidCount++;
      continue;
    }

    const title = toCleanString(shape.data.title);
    const artist = toCleanString(shape.data.artist);

    if (!title || !artist) {
      invalidCount++;
      continue;
    }

    const key = buildCandidateKey(title, artist);
    if (!key || key === '::') {
      invalidCount++;
      continue;
    }

    if (seen.has(key)) {
      duplicateCount++;
      continue;
    }

    seen.add(key);
    candidates.push({ title, artist });
  }

  return {
    candidates,
    rawCount: rawSongs.length,
    invalidCount,
    duplicateCount
  };
}
