import { CuratedSectionModel, type ICuratedSectionDoc, type ICuratedSectionStats } from '../models/curatedSection.model.js';
import { CurationRefreshLockModel } from '../models/curationRefreshLock.model.js';
import { ISongSubDoc } from '../models/playlist.model.js';
import { CURATED_SECTIONS, type CuratedSectionId } from '../config/curationConfig.js';
import { buildCandidateKey } from '../utils/curationCandidates.js';
import { logger, serializeError } from '../utils/logger.js';

const SCOPE = 'CuratedSectionRepository';

export interface CuratedSectionRecord {
  sectionId: CuratedSectionId;
  title: string;
  tracks: ISongSubDoc[];
  generatedAt: Date;
  updatedAt: Date;
  refreshCount: number;
}

function toRecord(doc: ICuratedSectionDoc): CuratedSectionRecord {
  return {
    sectionId: doc.sectionId,
    title: doc.title,
    tracks: Array.isArray(doc.tracks) ? doc.tracks : [],
    generatedAt: doc.generatedAt ?? doc.updatedAt,
    updatedAt: doc.updatedAt,
    refreshCount: doc.refreshCount ?? 0
  };
}

export class CuratedSectionRepository {
  async acquireRefreshLock(sectionId: CuratedSectionId, owner: string, leaseMs: number): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseMs);

    try {
      const lock = await CurationRefreshLockModel.findOneAndUpdate(
        {
          sectionId,
          $or: [{ expiresAt: { $lte: now } }, { owner }]
        },
        { $set: { owner, expiresAt } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean().exec();

      return lock?.owner === owner;
    } catch (error: unknown) {
      // A concurrent first acquisition can race on the unique sectionId index.
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  }

  async releaseRefreshLock(sectionId: CuratedSectionId, owner: string): Promise<void> {
    await CurationRefreshLockModel.deleteOne({ sectionId, owner }).exec();
  }

  async renewRefreshLock(sectionId: CuratedSectionId, owner: string, leaseMs: number): Promise<boolean> {
    const now = new Date();
    const result = await CurationRefreshLockModel.updateOne(
      { sectionId, owner, expiresAt: { $gt: now } },
      { $set: { expiresAt: new Date(now.getTime() + leaseMs) } }
    ).exec();

    return result.modifiedCount === 1;
  }

  async findAll(): Promise<CuratedSectionRecord[]> {
    const docs = await CuratedSectionModel.find({}).lean<ICuratedSectionDoc[]>().exec();
    const bySectionId = new Map(docs.map(doc => [doc.sectionId, doc]));

    return CURATED_SECTIONS.map(definition => bySectionId.get(definition.id))
      .filter((doc): doc is ICuratedSectionDoc => Boolean(doc))
      .map(toRecord);
  }

  async findBySectionId(sectionId: CuratedSectionId): Promise<CuratedSectionRecord | null> {
    const doc = await CuratedSectionModel.findOne({ sectionId }).lean<ICuratedSectionDoc | null>().exec();
    return doc ? toRecord(doc) : null;
  }

  async replaceSection(options: {
    sectionId: CuratedSectionId;
    title: string;
    tracks: ISongSubDoc[];
    llmModel: string;
    stats: ICuratedSectionStats;
    generatedAt?: Date;
  }): Promise<CuratedSectionRecord> {
    const doc = await CuratedSectionModel.findOneAndUpdate(
      { sectionId: options.sectionId },
      {
        $set: {
          title: options.title,
          tracks: options.tracks,
          generatedAt: options.generatedAt ?? new Date(),
          llmModel: options.llmModel,
          stats: options.stats
        },
        $inc: { refreshCount: 1 }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).exec();

    if (!doc) {
      throw new Error(`Failed to persist curated section ${options.sectionId}`);
    }

    logger.info(SCOPE, 'Curated section saved', {
      sectionId: options.sectionId,
      trackCount: options.tracks.length,
      refreshCount: doc.refreshCount
    });

    return toRecord(doc);
  }

  async findStaleOrMissingSectionIds(staleAfterMs: number): Promise<CuratedSectionId[]> {
    try {
      const docs = await CuratedSectionModel.find({}, { sectionId: 1, generatedAt: 1, tracks: 1 })
        .lean<Array<Pick<ICuratedSectionDoc, 'sectionId' | 'generatedAt' | 'tracks'>>>()
        .exec();

      const cutoff = Date.now() - staleAfterMs;
      const healthy = new Set(
        docs
          .filter(doc => {
            const hasTracks = Array.isArray(doc.tracks) && doc.tracks.length > 0;
            const generatedAt = doc.generatedAt ? new Date(doc.generatedAt).getTime() : 0;
            return hasTracks && generatedAt >= cutoff;
          })
          .map(doc => doc.sectionId)
      );

      return CURATED_SECTIONS.map(definition => definition.id).filter(sectionId => !healthy.has(sectionId));
    } catch (error) {
      logger.error(SCOPE, 'Failed to inspect curated section freshness', { error: serializeError(error) });
      return [];
    }
  }

  async getTrackKeysForOverlapGroup(
    overlapGroup: string,
    excludeSectionId: CuratedSectionId
  ): Promise<{ providerIds: Set<string>; titleArtistKeys: Set<string> }> {
    const siblingIds = CURATED_SECTIONS.filter(
      definition => definition.overlapGroup === overlapGroup && definition.id !== excludeSectionId
    ).map(definition => definition.id);

    const providerIds = new Set<string>();
    const titleArtistKeys = new Set<string>();

    if (siblingIds.length === 0) {
      return { providerIds, titleArtistKeys };
    }

    const docs = await CuratedSectionModel.find({ sectionId: { $in: siblingIds } }, { tracks: 1 })
      .lean<Array<Pick<ICuratedSectionDoc, 'tracks'>>>()
      .exec();

    for (const doc of docs) {
      for (const track of doc.tracks || []) {
        if (!track) continue;
        if (track.id) providerIds.add(String(track.id));
        const key = buildCandidateKey(track.name || '', track.artist_name || '');
        if (key && key !== '::') titleArtistKeys.add(key);
      }
    }

    return { providerIds, titleArtistKeys };
  }
}

export const curatedSectionRepository = new CuratedSectionRepository();
