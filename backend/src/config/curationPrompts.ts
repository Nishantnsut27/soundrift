import { CURATION_ENGINE_CONFIG, type CuratedSectionId } from './curationConfig.js';

export const CURATION_SYSTEM_PROMPT = [
  'You are a music discovery assistant for Soundrift.',
  'Your job is to return song recommendations requested by the user.',
  '',
  'Always return ONLY valid JSON.',
  'Do not return markdown.',
  'Do not return explanations.',
  'Do not return code fences.',
  'Do not return comments.',
  'Do not return additional text.',
  '',
  'Use exactly this JSON structure:',
  '{',
  '  "songs": [',
  '    {',
  '      "title": "Song name",',
  '      "artist": "Artist name"',
  '    }',
  '  ]',
  '}',
  '',
  'Return only title and artist for every song.',
  'Do not add any other fields.'
].join('\n');

const CANDIDATE_LIMIT = CURATION_ENGINE_CONFIG.candidateLimit;

export function formatCurationTimestamp(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(now);

  return `${parts} IST`;
}

export function buildCurationUserPrompt(sectionId: CuratedSectionId, now: Date = new Date()): string {
  const timestamp = formatCurationTimestamp(now);

  switch (sectionId) {
    case 'trending':
      return [
        `Give me up to ${CANDIDATE_LIMIT} trending songs in India right now.`,
        `Current date and time: ${timestamp}`
      ].join('\n');

    case 'editors_picks':
      return [
        `Give me up to ${CANDIDATE_LIMIT} diverse and interesting Indian songs for an Editor's Picks section.`,
        'Include a good mix of Hindi, Punjabi, Bollywood, independent, hip-hop, and regional music where appropriate.'
      ].join('\n');

    case 'fresh_releases':
      return [
        `Give me up to ${CANDIDATE_LIMIT} recently released Indian songs.`,
        `Current date and time: ${timestamp}`
      ].join('\n');

    case 'kpop':
      return `Give me up to ${CANDIDATE_LIMIT} popular and interesting K-Pop songs.`;

    case 'worldwide':
      return [
        `Give me up to ${CANDIDATE_LIMIT} popular and interesting songs from around the world.`,
        'Include a diverse mix of international music.'
      ].join('\n');

    case 'old_hindi_gold':
      return [
        `Give me up to ${CANDIDATE_LIMIT} classic Hindi film songs from the 1950s through the 1970s.`,
        'Draw on the playback singers and composers of that era.',
        'Prefer the well-loved originals over later remixes, covers or reprise versions.'
      ].join('\n');

    case 'nineties_bollywood':
      return [
        `Give me up to ${CANDIDATE_LIMIT} Bollywood songs released between 1990 and 1999.`,
        'Stay inside that decade — nothing from the 1980s or the 2000s.',
        'Prefer the original film versions over remixes and modern remakes.'
      ].join('\n');

    case 'monsoon':
      return [
        `Give me up to ${CANDIDATE_LIMIT} well-known Hindi film songs about rain, clouds and the monsoon.`,
        'Mix classic and contemporary, and stay with songs that were widely popular.'
      ].join('\n');

    case 'late_night':
      return [
        `Give me up to ${CANDIDATE_LIMIT} songs that suit listening late at night.`,
        'Aim for calm, slow, low-energy and introspective tracks rather than club music.',
        'Mix Hindi and international.',
        `Current date and time: ${timestamp}`
      ].join('\n');

    case 'morning_commute':
      return [
        `Give me up to ${CANDIDATE_LIMIT} upbeat songs for a morning drive to work.`,
        'Aim for bright, energetic, easy-to-sing-along tracks that wake a listener up.',
        'Mix Hindi and international.',
        `Current date and time: ${timestamp}`
      ].join('\n');

    default: {
      const exhaustiveCheck: never = sectionId;
      throw new Error(`No curation prompt defined for section: ${String(exhaustiveCheck)}`);
    }
  }
}
