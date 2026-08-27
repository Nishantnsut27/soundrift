import { Schema, model, type Document } from 'mongoose';
import type { CuratedSectionId } from '../config/curationConfig.js';

interface ICurationRefreshLockDoc extends Document {
  sectionId: CuratedSectionId;
  owner: string;
  expiresAt: Date;
}

const curationRefreshLockSchema = new Schema<ICurationRefreshLockDoc>(
  {
    sectionId: { type: String, required: true, unique: true },
    owner: { type: String, required: true },
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

curationRefreshLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CurationRefreshLockModel = model<ICurationRefreshLockDoc>(
  'CurationRefreshLock',
  curationRefreshLockSchema
);
