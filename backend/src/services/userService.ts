import mongoose from 'mongoose';
import { User } from '../models/user.model.js';
import { PlaylistModel, ISongSubDoc } from '../models/playlist.model.js';
import { Favorite } from '../models/favorite.model.js';
import { RecentlyPlayed } from '../models/recentlyPlayed.model.js';
import { ListeningHistory } from '../models/listeningHistory.model.js';
import { SearchHistory } from '../models/searchHistory.model.js';
import { CloudinaryService } from './cloudinaryService.js';
import { AppError } from '../utils/AppError.js';

const MAX_PLAYLIST_TRACKS = 500;
const MAX_PLAYLIST_NAME_LENGTH = 100;
const MAX_PLAYLIST_DESCRIPTION_LENGTH = 500;

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').slice(0, 20);
};

const getTrackId = (raw: unknown): string => {
  const id = (raw as Record<string, unknown> | null | undefined)?.id;
  return id === undefined || id === null ? '' : String(id).trim();
};

const normalizeTrackData = (raw: Record<string, unknown>): ISongSubDoc => {
  const trackId = getTrackId(raw);
  if (!trackId) {
    throw new AppError('Invalid track data: a track id is required.', 400);
  }

  const duration = Number(raw.duration);
  const tags = (raw.musicinfo as { tags?: Record<string, unknown> } | undefined)?.tags;

  const normalized: ISongSubDoc = {
    id: trackId,
    name: String(raw.name || 'Untitled Track').slice(0, 300),
    duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
    artist_name: String(raw.artist_name || 'Unknown Artist').slice(0, 300),
    artist_id: String(raw.artist_id || ''),
    album_name: String(raw.album_name || '').slice(0, 300),
    album_id: String(raw.album_id || ''),
    album_image: String(raw.album_image || ''),
    image: String(raw.image || ''),
    audio: String(raw.audio || ''),
    audiodownload: String(raw.audiodownload || ''),
    license_ccurl: String(raw.license_ccurl || ''),
    provider: raw.provider === 'jiosaavn' ? 'jiosaavn' : 'jamendo',
  };

  if (tags) {
    normalized.musicinfo = {
      tags: {
        genres: toStringArray(tags.genres),
        instruments: toStringArray(tags.instruments),
        vartags: toStringArray(tags.vartags),
      },
    };
  }

  return normalized;
};

const normalizePlaylistName = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('A playlist name is required.', 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_PLAYLIST_NAME_LENGTH) {
    throw new AppError(`Playlist name cannot exceed ${MAX_PLAYLIST_NAME_LENGTH} characters.`, 400);
  }
  return trimmed;
};

const normalizePlaylistDescription = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new AppError('Playlist description must be text.', 400);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_PLAYLIST_DESCRIPTION_LENGTH) {
    throw new AppError(`Playlist description cannot exceed ${MAX_PLAYLIST_DESCRIPTION_LENGTH} characters.`, 400);
  }
  return trimmed;
};

export class UserService {
  public static async getSearchHistory(userId: string, limit = 10) {
    return SearchHistory.find({ user: userId }).sort({ searchedAt: -1 }).limit(limit).lean();
  }

  public static async addSearchHistory(userId: string, query: string) {
    const cleanQuery = query.trim().replace(/\s+/g, ' ');
    if (!cleanQuery) return;
    await SearchHistory.findOneAndUpdate(
      { user: userId, normalizedQuery: cleanQuery.toLowerCase() },
      { user: userId, query: cleanQuery, normalizedQuery: cleanQuery.toLowerCase(), searchedAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const stale = await SearchHistory.find({ user: userId }).sort({ searchedAt: -1 }).skip(10).select('_id').lean();
    if (stale.length) await SearchHistory.deleteMany({ _id: { $in: stale.map(item => item._id) } });
  }

  public static async removeSearchHistory(userId: string, query: string) {
    await SearchHistory.deleteOne({ user: userId, normalizedQuery: query.trim().toLowerCase() });
  }

  public static async clearSearchHistory(userId: string) {
    await SearchHistory.deleteMany({ user: userId });
  }
  // =========================================================================
  // Favorites Service
  // =========================================================================
  
  public static async getFavorites(userId: string) {
    const favorites = await Favorite.find({ user: userId }).sort({ addedAt: -1 }).lean();
    return favorites.map((f) => ({
      ...f.trackData,
      addedAt: f.addedAt,
    }));
  }

  public static async addFavorite(userId: string, trackData: Record<string, unknown>) {
    const normalized = normalizeTrackData(trackData);

    const favorite = await Favorite.findOneAndUpdate(
      { user: userId, trackId: normalized.id },
      {
        user: userId,
        trackId: normalized.id,
        trackData: normalized,
        addedAt: new Date(),
      },
      { upsert: true, new: true, runValidators: true }
    );

    return favorite.trackData;
  }

  public static async removeFavorite(userId: string, trackId: string) {
    await Favorite.deleteOne({ user: userId, trackId });
    return { trackId };
  }

  public static async clearFavorites(userId: string) {
    await Favorite.deleteMany({ user: userId });
  }

  // =========================================================================
  // Playlist Management Service (Ownership Enforced)
  // =========================================================================

  public static async getUserPlaylists(userId: string) {
    const playlists = await PlaylistModel.find({ owner: userId }).sort({ updatedAt: -1 }).lean();
    return playlists.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      description: p.description || '',
      owner: p.owner.toString(),
      isPublic: p.isPublic,
      coverImage: p.coverImage || '',
      tracks: p.tracks || [],
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  public static async createPlaylist(userId: string, name: string, description = '', isPublic = false) {
    const playlist = await PlaylistModel.create({
      name: normalizePlaylistName(name),
      description: normalizePlaylistDescription(description),
      owner: userId,
      isPublic: isPublic === true,
      tracks: [],
    });

    return {
      id: playlist._id.toString(),
      name: playlist.name,
      description: playlist.description,
      owner: playlist.owner.toString(),
      isPublic: playlist.isPublic,
      tracks: playlist.tracks,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
    };
  }

  public static async updatePlaylist(userId: string, playlistId: string, data: { name?: string; description?: string; isPublic?: boolean }) {
    const playlist = await PlaylistModel.findOne({ _id: playlistId, owner: userId });
    if (!playlist) {
      throw new AppError('Playlist not found or access denied', 404);
    }

    if (data.name !== undefined) playlist.name = normalizePlaylistName(data.name);
    if (data.description !== undefined) playlist.description = normalizePlaylistDescription(data.description);
    if (data.isPublic !== undefined) playlist.isPublic = data.isPublic === true;

    await playlist.save();

    return {
      id: playlist._id.toString(),
      name: playlist.name,
      description: playlist.description,
      owner: playlist.owner.toString(),
      isPublic: playlist.isPublic,
      tracks: playlist.tracks,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
    };
  }

  public static async deletePlaylist(userId: string, playlistId: string) {
    const result = await PlaylistModel.deleteOne({ _id: playlistId, owner: userId });
    if (result.deletedCount === 0) {
      throw new AppError('Playlist not found or access denied', 404);
    }
    return { id: playlistId };
  }

  public static async addTrackToPlaylist(userId: string, playlistId: string, trackData: Record<string, unknown>) {
    const playlist = await PlaylistModel.findOne({ _id: playlistId, owner: userId });
    if (!playlist) {
      throw new AppError('Playlist not found or access denied', 404);
    }

    const newTrack = normalizeTrackData(trackData);

    if (playlist.tracks.some((t) => t.id === newTrack.id)) {
      return {
        id: playlist._id.toString(),
        tracks: playlist.tracks,
      };
    }

    if (playlist.tracks.length >= MAX_PLAYLIST_TRACKS) {
      throw new AppError(`A playlist cannot hold more than ${MAX_PLAYLIST_TRACKS} tracks.`, 400);
    }

    playlist.tracks.push(newTrack);
    await playlist.save();

    return {
      id: playlist._id.toString(),
      tracks: playlist.tracks,
    };
  }

  public static async removeTrackFromPlaylist(userId: string, playlistId: string, trackId: string) {
    const playlist = await PlaylistModel.findOne({ _id: playlistId, owner: userId });
    if (!playlist) {
      throw new AppError('Playlist not found or access denied', 404);
    }

    playlist.tracks = playlist.tracks.filter((t) => t.id !== trackId);
    await playlist.save();

    return {
      id: playlist._id.toString(),
      tracks: playlist.tracks,
    };
  }

  public static async reorderPlaylistTracks(userId: string, playlistId: string, tracks: unknown) {
    const playlist = await PlaylistModel.findOne({ _id: playlistId, owner: userId });
    if (!playlist) {
      throw new AppError('Playlist not found or access denied', 404);
    }

    if (!Array.isArray(tracks)) {
      throw new AppError('A track order array is required.', 400);
    }

    const requestedIds = tracks.map((entry) =>
      typeof entry === 'string' ? entry.trim() : getTrackId(entry)
    );

    if (requestedIds.some((id) => !id)) {
      throw new AppError('Every entry in the track order must include a track id.', 400);
    }

    if (new Set(requestedIds).size !== requestedIds.length) {
      throw new AppError('The track order contains duplicate track ids.', 400);
    }

    if (requestedIds.length !== playlist.tracks.length) {
      throw new AppError('The track order must contain every track already in the playlist.', 400);
    }

    const existingById = new Map(playlist.tracks.map((track) => [track.id, track]));
    const reordered = requestedIds.map((id) => {
      const existing = existingById.get(id);
      if (!existing) {
        throw new AppError('The track order references a track that is not in this playlist.', 400);
      }
      return existing;
    });

    playlist.tracks = reordered;
    await playlist.save();

    return {
      id: playlist._id.toString(),
      tracks: playlist.tracks,
    };
  }

  // =========================================================================
  // Recently Played & Listening History
  // =========================================================================

  public static async addRecentlyPlayed(userId: string, trackData: Record<string, unknown>) {
    if (!getTrackId(trackData)) return;

    const normalized = normalizeTrackData(trackData);
    await RecentlyPlayed.findOneAndUpdate(
      { user: userId, trackId: normalized.id },
      {
        user: userId,
        trackId: normalized.id,
        trackData: normalized,
        playedAt: new Date(),
      },
      { upsert: true, new: true }
    );
  }

  public static async getRecentlyPlayed(userId: string, limit = 20) {
    const items = await RecentlyPlayed.find({ user: userId })
      .sort({ playedAt: -1 })
      .limit(limit)
      .lean();

    return items.map((item) => ({
      ...item.trackData,
      playedAt: item.playedAt,
    }));
  }

  public static async recordListeningHistory(userId: string, trackData: Record<string, unknown>, playDurationSeconds = 0, completed = false) {
    if (!getTrackId(trackData)) return;

    const normalized = normalizeTrackData(trackData);
    const duration = Number(playDurationSeconds);

    await ListeningHistory.create({
      user: userId,
      trackId: normalized.id,
      trackData: normalized,
      playDurationSeconds: Number.isFinite(duration) ? Math.max(0, duration) : 0,
      completed: completed === true,
      playedAt: new Date(),
    });
  }

  public static async getListeningHistory(userId: string, limit = 50) {
    const items = await ListeningHistory.find({ user: userId })
      .sort({ playedAt: -1 })
      .limit(limit)
      .lean();

    return items.map((item) => ({
      ...item.trackData,
      playDurationSeconds: item.playDurationSeconds,
      completed: item.completed,
      playedAt: item.playedAt,
    }));
  }

  // =========================================================================
  // Profile Management
  // =========================================================================

  public static async updateUserProfile(userId: string, data: { fullName?: string; avatar?: string }) {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (data.fullName !== undefined && data.fullName.trim()) {
      user.fullName = data.fullName.trim();
    }
    if (data.avatar !== undefined) {
      user.avatar = data.avatar;
    }

    await user.save();

    return {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      avatar: user.avatarUrl || (typeof user.avatar === 'string' ? user.avatar : user.avatar?.url) || '',
      avatarPublicId: user.avatarPublicId,
      role: user.role,
      accountStatus: user.accountStatus,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
    };
  }

  /**
   * Upload/replace user avatar using Cloudinary with automatic deletion of previous asset
   */
  public static async uploadAvatar(userId: string, fileBuffer: Buffer) {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Delete existing Cloudinary image asset if present
    if (user.avatarPublicId) {
      await CloudinaryService.deleteAvatar(user.avatarPublicId);
    }

    // Upload new image buffer to Cloudinary
    const uploadResult = await CloudinaryService.uploadAvatarBuffer(fileBuffer);

    user.avatarUrl = uploadResult.url;
    user.avatarPublicId = uploadResult.public_id;
    await user.save();

    console.log(`🖼️ [Cloudinary] Avatar updated for user ${user.email}: ${uploadResult.url}`);

    return {
      url: uploadResult.url,
      public_id: uploadResult.public_id,
    };
  }

  /**
   * Delete user account and cascade delete user data from MongoDB Atlas
   */
  public static async deleteAccount(userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User account not found', 404);
    }

    const { email, avatarPublicId } = user;

    const cascadeDelete = async (session?: mongoose.ClientSession) => {
      const options = session ? { session } : {};
      await PlaylistModel.deleteMany({ owner: userId }, options);
      await Favorite.deleteMany({ user: userId }, options);
      await RecentlyPlayed.deleteMany({ user: userId }, options);
      await ListeningHistory.deleteMany({ user: userId }, options);
      await SearchHistory.deleteMany({ user: userId }, options);
      await User.deleteOne({ _id: userId }, options);
    };

    let session: mongoose.ClientSession | null = null;
    try {
      session = await mongoose.startSession();
      await session.withTransaction(() => cascadeDelete(session as mongoose.ClientSession));
    } catch {
      await cascadeDelete();
    } finally {
      if (session) {
        await session.endSession().catch(() => {});
      }
    }

    if (avatarPublicId) {
      await CloudinaryService.deleteAvatar(avatarPublicId).catch(() => {});
    }

    console.log(`🗑️ [Account] Deleted user account & associated data: ${email} (${userId})`);
    return { success: true };
  }
}
