import { z } from 'zod';
import { LIVE_CURATION_CONFIG, type LiveSectionId } from '../config/liveCurationConfig.js';
import type { SearchSource } from '../models/curationSearch.model.js';
import { buildCandidateKey, type SongCandidate } from './curationCandidates.js';

export interface WebCandidate extends SongCandidate {
  language: string;
  sourceUrl: string;
  evidence: string;
  date: string;
  dateEvidence: string;
  kind: 'release' | 'trend';
}

const candidateSchema = z.object({
  title: z.string().trim().min(2).max(200),
  artist: z.string().trim().min(2).max(200),
  language: z.enum(['hindi', 'punjabi', 'haryanvi']),
  sourceUrl: z.string().url().max(2000),
  evidence: z.string().trim().min(10).max(1200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateEvidence: z.string().trim().min(6).max(300),
  kind: z.enum(['release', 'trend'])
});

const normalized = (value: string): string => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const words = (value: string): string => normalized(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function validDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

/** Requires the claimed full date to occur in the retrieved quote, not just in an LLM field. */
export function containsDate(quote: string, iso: string): boolean {
  if (validDate(iso) === null) return false;
  const [year, month, day] = iso.split('-').map(Number);
  const monthName = new Date(`${iso}T00:00:00Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }).toLowerCase();
  const text = normalized(quote).replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/[,./]/g, ' ');
  const monthPattern = `(?:${monthName}|${monthName.slice(0, 3)})`;
  return quote.includes(iso) || new RegExp(`\\b(?:0?${day}\\s+${monthPattern}\\s+${year}|${monthPattern}\\s+0?${day}\\s+${year}|0?${day}\\s+0?${month}\\s+${year})\\b`, 'i').test(text);
}

export function extractWebCandidates(raw: string, sources: SearchSource[], section: LiveSectionId, today: string): WebCandidate[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')); } catch { return []; }
  const root = z.object({ songs: z.array(z.unknown()).max(100) }).safeParse(parsed);
  if (!root.success) return [];
  const byUrl = new Map(sources.map(source => [source.url, normalized(`${source.title}\n${source.content}`)]));
  const now = validDate(today)!;
  const maxAge = section === 'fresh_releases' ? LIVE_CURATION_CONFIG.freshMaxAgeDays : 7;
  const seen = new Set<string>();
  const candidates: WebCandidate[] = [];
  for (const entry of root.data.songs) {
    const result = candidateSchema.safeParse(entry);
    if (!result.success) continue;
    const item = result.data;
    const date = validDate(item.date);
    const source = byUrl.get(item.sourceUrl);
    if (date === null || date > now || now - date > maxAge * 86400000 ||
      item.kind !== (section === 'trending' ? 'trend' : 'release') || !source ||
      !source.includes(normalized(item.evidence)) || !source.includes(normalized(item.dateEvidence)) ||
      !containsDate(item.dateEvidence, item.date)) continue;
    // Reject titles/artists supplied from model memory instead of the cited text.
    const evidence = ` ${words(item.evidence)} `;
    if (!evidence.includes(` ${words(item.title)} `) || !evidence.includes(` ${words(item.artist)} `)) continue;
    const key = buildCandidateKey(item.title, item.artist);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(item);
    if (candidates.length >= LIVE_CURATION_CONFIG.maxWebCandidates) break;
  }
  return candidates;
}
