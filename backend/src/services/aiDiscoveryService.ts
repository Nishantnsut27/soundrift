import axios from 'axios';
import { z } from 'zod';
import { config } from '../config/config.js';
import type { DiscoverySectionKey } from '../models/discoverySnapshot.model.js';
import type { SongCandidate } from '../utils/songMatcher.js';

const candidateSchema = z.object({ title: z.string().trim().min(1).max(180), artist: z.string().trim().min(1).max(180), reason: z.string().trim().min(1).max(300) });
const responseSchema = z.object({ candidates: z.array(candidateSchema).default([]) });
const sectionInstructions: Record<DiscoverySectionKey, string> = {
  trending: 'Songs receiving significant attention in India right now. Use recent streaming momentum, charts, viral/social trends, YouTube activity, or cultural attention. Prioritize current momentum, not historical popularity.',
  popularThisWeek: 'Songs with strong popularity or momentum in India during the last 7 days, based on recent charts, streaming activity, and short-term momentum.',
  editorsPicks: "A diverse selection of high-quality Indian music chosen for originality, artistry, cultural relevance, and discovery value. Do not simply repeat the biggest mainstream hits.",
  freshReleases: 'Genuinely new, official Indian song releases relevant at execution time.'
};

export class AiDiscoveryService {
  async generateCandidates(section: DiscoverySectionKey): Promise<SongCandidate[]> {
    if (!config.groqApiKey) throw new Error('GROQ_API_KEY is not configured.');
    const size = config.discoverySectionSize + 5;
    const generatedAt = new Date().toISOString();
    const prompt = `You are Soundrift's Indian music discovery curator.\n\nCurate one list of real Indian songs using current and recent information.\n\nCURRENT DATE AND TIME:\n${generatedAt}\n\nRESEARCH AND ACCURACY RULES:\n- Use current, recent, reliable information. Never invent or guess a song, artist, release date, chart position, trend, or popularity signal.\n- Include only real, officially released songs. Verify every title and artist; exclude uncertain candidates. It is better to return fewer songs.\n\nARTIST RULES:\n- Return only primary credited artists. Do not include featured artists unless officially credited as primary artists.\n- For multiple primary artists, separate names naturally with commas. Do not return composers, lyricists, actors, albums, playlists, or labels in artist.\n\nSECTION TO CURATE:\n${sectionInstructions[section]}\n\nDIVERSITY RULES:\n- Cover Hindi, Punjabi, Bollywood, independent, hip-hop, and regional Indian music where appropriate.\n- Aim for diversity across language, genre, artist, and music scene. Avoid multiple songs by one artist unless strongly justified.\n\nOUTPUT RULES:\n- Return only valid JSON; no markdown, citations, URLs, notes, comments, or text outside JSON.\n- Return up to ${size} songs; never force the count.\n- Each reason must be factual, specific, under 15 words, and not vague.\n\nRETURN EXACTLY THIS JSON STRUCTURE:\n{"candidates":[{"title":"Song title","artist":"Primary artist","reason":"Short factual reason"}]}`;
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: config.groqDiscoveryModel, messages: [{ role: 'user', content: prompt }], temperature: 0.35,
      reasoning_effort: 'low'
    }, { headers: { Authorization: `Bearer ${config.groqApiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 });
    const content = response.data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Groq returned no structured content.');
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new Error('Groq returned invalid JSON.'); }
    return responseSchema.parse(parsed).candidates;
  }
}
