import { Document, model, Schema } from 'mongoose';
import { Song } from './music.model.js';

export type DiscoverySectionKey = 'trending' | 'popularThisWeek' | 'editorsPicks' | 'freshReleases';
export type DiscoverySections = Record<DiscoverySectionKey, Array<Song & { reason: string; rank: number }>>;

export interface IDiscoverySnapshot extends Document {
  generatedAt: Date;
  expiresAt: Date;
  status: 'active' | 'archived';
  sections: DiscoverySections;
}

const discoveryTrackSchema = new Schema({
  id: { type: String, required: true }, name: { type: String, required: true }, duration: { type: Number, default: 0 },
  artist_name: { type: String, default: '' }, artist_id: { type: String, default: '' }, album_name: { type: String, default: '' },
  album_id: { type: String, default: '' }, album_image: { type: String, default: '' }, image: { type: String, default: '' },
  audio: { type: String, default: '' }, audiodownload: { type: String, default: '' }, license_ccurl: { type: String, default: '' },
  musicinfo: { type: Schema.Types.Mixed, default: {} }, provider: { type: String, enum: ['jiosaavn', 'jamendo'], required: true },
  reason: { type: String, required: true, maxlength: 300 }, rank: { type: Number, required: true }
}, { _id: false });

const sectionsSchema = new Schema({
  trending: { type: [discoveryTrackSchema], default: [] }, popularThisWeek: { type: [discoveryTrackSchema], default: [] },
  editorsPicks: { type: [discoveryTrackSchema], default: [] }, freshReleases: { type: [discoveryTrackSchema], default: [] }
}, { _id: false });

const discoverySnapshotSchema = new Schema<IDiscoverySnapshot>({
  generatedAt: { type: Date, required: true, index: true }, expiresAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['active', 'archived'], required: true, index: true }, sections: { type: sectionsSchema, required: true }
}, { timestamps: true });
discoverySnapshotSchema.index({ status: 1, generatedAt: -1 });

export const DiscoverySnapshot = model<IDiscoverySnapshot>('DiscoverySnapshot', discoverySnapshotSchema);
