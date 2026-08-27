import { Schema, model, Document } from 'mongoose';
import { songSubSchema, type ISongSubDoc } from './playlist.model.js';
import { CURATED_SECTION_IDS, type CuratedSectionId } from '../config/curationConfig.js';

export interface ICuratedSectionStats {
  rawCandidateCount: number;
  validCandidateCount: number;
  duplicateCandidatesRemoved: number;
  resolvedCount: number;
  unresolvedCount: number;
  duplicateTracksRemoved: number;
}

export interface ICuratedSectionDoc extends Document {
  sectionId: CuratedSectionId;
  title: string;
  tracks: ISongSubDoc[];
  generatedAt: Date;
  refreshCount: number;
  llmModel: string;
  stats: ICuratedSectionStats;
  createdAt: Date;
  updatedAt: Date;
}

const curatedSectionStatsSchema = new Schema<ICuratedSectionStats>(
  {
    rawCandidateCount: { type: Number, default: 0 },
    validCandidateCount: { type: Number, default: 0 },
    duplicateCandidatesRemoved: { type: Number, default: 0 },
    resolvedCount: { type: Number, default: 0 },
    unresolvedCount: { type: Number, default: 0 },
    duplicateTracksRemoved: { type: Number, default: 0 },
  },
  { _id: false }
);

const curatedSectionSchema = new Schema<ICuratedSectionDoc>(
  {
    sectionId: {
      type: String,
      required: [true, 'Curated section id is required'],
      enum: CURATED_SECTION_IDS as unknown as string[],
      unique: true,
    },
    title: {
      type: String,
      required: [true, 'Curated section title is required'],
      trim: true,
    },
    tracks: [songSubSchema],
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    refreshCount: {
      type: Number,
      default: 0,
    },
    llmModel: {
      type: String,
      default: '',
    },
    stats: {
      type: curatedSectionStatsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

curatedSectionSchema.index({ generatedAt: -1 });

export const CuratedSectionModel = model<ICuratedSectionDoc>('CuratedSection', curatedSectionSchema);
