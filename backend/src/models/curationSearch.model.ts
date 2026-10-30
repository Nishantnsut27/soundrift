import { Schema, model } from 'mongoose';

export interface SearchSource {
  url: string;
  title: string;
  content: string;
}

export interface ICurationSearch {
  _id: string;
  state: 'pending' | 'ready' | 'failed';
  sources: SearchSource[];
  fetchedAt: Date;
  expiresAt: Date;
}

const searchSchema = new Schema<ICurationSearch>({
  _id: { type: String, required: true },
  state: { type: String, enum: ['pending', 'ready', 'failed'], required: true },
  sources: [{ _id: false, url: String, title: String, content: String }],
  fetchedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
});
searchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const budgetSchema = new Schema<{ _id: string; requests: number }>({
  _id: { type: String, required: true },
  requests: { type: Number, required: true, default: 0 }
});

export const CurationSearchModel = model<ICurationSearch>('CurationSearch', searchSchema);
export const CurationSearchBudgetModel = model('CurationSearchBudget', budgetSchema);
