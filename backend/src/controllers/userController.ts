import { Response, NextFunction } from 'express';
import { UserService } from '../services/userService.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { clearAuthCookies } from '../utils/token.utils.js';

export class UserController {
  public static async getSearchHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await UserService.getSearchHistory(req.user!._id.toString());
      res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
  }

  public static async addSearchHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = typeof req.body.query === 'string' ? req.body.query : '';
      if (!query.trim()) { res.status(400).json({ success: false, error: 'A search query is required.' }); return; }
      await UserService.addSearchHistory(req.user!._id.toString(), query);
      res.status(200).json({ success: true });
    } catch (error) { next(error); }
  }

  public static async removeSearchHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try { await UserService.removeSearchHistory(req.user!._id.toString(), String(req.params.query)); res.status(200).json({ success: true }); } catch (error) { next(error); }
  }

  public static async clearSearchHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try { await UserService.clearSearchHistory(req.user!._id.toString()); res.status(200).json({ success: true }); } catch (error) { next(error); }
  }

  // =========================================================================
  // Profile Handlers
  // =========================================================================

  public static async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id.toString();
      const favoritesCount = await UserService.getFavorites(userId);
      const playlists = await UserService.getUserPlaylists(userId);

      res.status(200).json({
        success: true,
        user: {
          id: req.user!._id.toString(),
          fullName: req.user!.fullName,
          email: req.user!.email,
          avatar: req.user!.avatar || '',
          role: req.user!.role,
          accountStatus: req.user!.accountStatus,
          isEmailVerified: req.user!.isEmailVerified,
          stats: {
            favoritesCount: favoritesCount.length,
            playlistsCount: playlists.length,
          },
          createdAt: req.user!.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!._id.toString();
      const updatedUser = await UserService.updateUserProfile(userId, req.body);

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        user: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // Favorites Handlers
  // =========================================================================

  public static async getFavorites(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const favorites = await UserService.getFavorites(req.user!._id.toString());
      res.status(200).json({
        success: true,
        data: favorites,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async addFavorite(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const trackData = req.body.trackData || req.body;
      const favorite = await UserService.addFavorite(req.user!._id.toString(), trackData);
      res.status(201).json({
        success: true,
        data: favorite,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async removeFavorite(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const trackId = Array.isArray(req.params.trackId) ? req.params.trackId[0] : req.params.trackId;
      await UserService.removeFavorite(req.user!._id.toString(), trackId);
      res.status(200).json({
        success: true,
        message: 'Favorite removed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async clearFavorites(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await UserService.clearFavorites(req.user!._id.toString());
      res.status(200).json({
        success: true,
        message: 'All favorites removed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // Playlist Handlers
  // =========================================================================

  public static async getPlaylists(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const playlists = await UserService.getUserPlaylists(req.user!._id.toString());
      res.status(200).json({
        success: true,
        data: playlists,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createPlaylist(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, description, isPublic } = req.body;
      const playlist = await UserService.createPlaylist(req.user!._id.toString(), name, description, isPublic);
      res.status(201).json({
        success: true,
        data: playlist,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updatePlaylist(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const playlistId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const playlist = await UserService.updatePlaylist(req.user!._id.toString(), playlistId, req.body);
      res.status(200).json({
        success: true,
        data: playlist,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deletePlaylist(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const playlistId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await UserService.deletePlaylist(req.user!._id.toString(), playlistId);
      res.status(200).json({
        success: true,
        message: 'Playlist deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async addTrackToPlaylist(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const playlistId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const trackData = req.body.trackData || req.body;
      const playlist = await UserService.addTrackToPlaylist(req.user!._id.toString(), playlistId, trackData);
      res.status(200).json({
        success: true,
        data: playlist,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async removeTrackFromPlaylist(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const playlistId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const trackId = Array.isArray(req.params.trackId) ? req.params.trackId[0] : req.params.trackId;
      const playlist = await UserService.removeTrackFromPlaylist(req.user!._id.toString(), playlistId, trackId);
      res.status(200).json({
        success: true,
        data: playlist,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async reorderPlaylistTracks(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const playlistId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const tracks = req.body.tracks || [];
      const playlist = await UserService.reorderPlaylistTracks(req.user!._id.toString(), playlistId, tracks);
      res.status(200).json({
        success: true,
        data: playlist,
      });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // Recently Played & Listening History Handlers
  // =========================================================================

  public static async getRecentlyPlayed(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = await UserService.getRecentlyPlayed(req.user!._id.toString());
      res.status(200).json({
        success: true,
        data: items,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async addRecentlyPlayed(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const trackData = req.body.trackData || req.body;
      await UserService.addRecentlyPlayed(req.user!._id.toString(), trackData);
      res.status(200).json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getListeningHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = await UserService.getListeningHistory(req.user!._id.toString());
      res.status(200).json({
        success: true,
        data: items,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async recordListeningHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { trackData, playDurationSeconds, completed } = req.body;
      await UserService.recordListeningHistory(req.user!._id.toString(), trackData, playDurationSeconds, completed);
      res.status(201).json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }

  // =========================================================================
  // Avatar Upload (Cloudinary) & Account Deletion Handlers
  // =========================================================================

  public static async uploadAvatar(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'Please select an image file to upload as avatar.',
        });
        return;
      }

      const avatar = await UserService.uploadAvatar(req.user!._id.toString(), req.file.buffer);

      res.status(200).json({
        success: true,
        message: 'Avatar uploaded successfully to Cloudinary.',
        avatar,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await UserService.deleteAccount(req.user!._id.toString());
      clearAuthCookies(res);

      res.status(200).json({
        success: true,
        message: 'User account and associated data successfully deleted.',
      });
    } catch (error) {
      next(error);
    }
  }
}
