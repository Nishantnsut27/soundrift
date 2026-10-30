import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { isLiveSection } from '../config/liveCurationConfig.js';
import { isCuratedSectionId } from '../config/curationConfig.js';
import { LiveCurationService } from '../services/liveCurationService.js';

// Makes metered searches and caches them, but never replaces curated sections.
async function run(): Promise<void> {
  const sections = process.argv.length > 2 ? process.argv.slice(2) : ['trending', 'fresh_releases'];
  if (sections.some(id => !isCuratedSectionId(id) || !isLiveSection(id))) throw new Error('Preview supports trending and fresh_releases');
  await connectDatabase();
  const service = new LiveCurationService();
  for (const id of sections) {
    if (!isCuratedSectionId(id) || !isLiveSection(id)) continue;
    const result = await service.generate(id);
    console.log(JSON.stringify({ section: id, webStatus: result.webStatus, stats: result.stats,
      webEvidence: result.provenance.filter(item => item.kind !== 'editorial'),
      tracks: result.tracks.map(song => ({ id: song.id, title: song.name, artist: song.artist_name, language: song.language, releaseDate: song.releaseDate }))
    }, null, 2));
  }
}

run().catch(error => {
  // Avoid printing connection strings, request configurations or API keys.
  console.error('Curation preview failed:', error instanceof Error ? error.name : 'Unknown error');
  process.exitCode = 1;
}).finally(() => disconnectDatabase());
