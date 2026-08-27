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

    default: {
      const exhaustiveCheck: never = sectionId;
      throw new Error(`No curation prompt defined for section: ${String(exhaustiveCheck)}`);
    }
  }
}
