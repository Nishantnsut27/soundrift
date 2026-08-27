import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { curationService } from '../services/curationService.js';
import { CURATED_SECTION_IDS, isCuratedSectionId } from '../config/curationConfig.js';
import { getGroqKeyDiagnostics } from '../services/groqService.js';
import { logger, serializeError } from '../utils/logger.js';

const SCOPE = 'CurationScript';

const run = async (): Promise<void> => {
  const requested = process.argv.slice(2).map(arg => arg.trim()).filter(Boolean);
  const invalid = requested.filter(arg => !isCuratedSectionId(arg));

  if (invalid.length > 0) {
    console.error(`Unknown section(s): ${invalid.join(', ')}`);
    console.error(`Valid sections: ${CURATED_SECTION_IDS.join(', ')}`);
    process.exit(1);
  }

  const sections = requested.length > 0 ? requested : [...CURATED_SECTION_IDS];

  logger.info(SCOPE, 'Manual curation started', {
    requestedSections: sections,
    ...curationService.describeConfiguration(),
    ...getGroqKeyDiagnostics()
  });

  await connectDatabase();

  for (const sectionId of sections) {
    if (!isCuratedSectionId(sectionId)) continue;
    const outcome = await curationService.refreshSection(sectionId);
    logger.info(SCOPE, 'Manual section refresh finished', { ...outcome });
  }

  await disconnectDatabase();
  logger.info(SCOPE, 'Manual curation completed', { sectionCount: sections.length });
};

run()
  .then(() => process.exit(0))
  .catch(async error => {
    logger.error(SCOPE, 'Manual curation failed', { error: serializeError(error) });
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
