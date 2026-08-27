import { Request, Response } from 'express';
import { MusicService } from '../services/musicService.js';
import { StandardApiResponse } from '../models/music.model.js';
import { logger, serializeError } from '../utils/logger.js';
import { discoveryRefreshService } from '../services/discoveryRefreshService.js';

const musicService = new MusicService();

export class MusicController {
  static async getDiscovery(_req: Request, res: Response): Promise<void> {
    try {
      const snapshot = await discoveryRefreshService.getActiveSnapshot();
      if (!snapshot) { res.status(404).json({ success: false, data: null, error: 'Discovery is being prepared. Please try again shortly.' }); return; }
      res.status(200).json({ success: true, data: { generatedAt: snapshot.generatedAt, sections: snapshot.sections } });
    } catch (error) {
      logger.error('MusicController', 'Get discovery error', { error: serializeError(error) });
      res.status(500).json({ success: false, data: null, error: 'Failed to retrieve discovery music.' });
    }
  }

  static async search(req: Request, res: Response): Promise<void> {
    try {
      const query = (req.query.q || req.query.query || '').toString().trim();
      const limit = parseInt((req.query.limit || '20').toString(), 10);

      if (!query) {
        res.status(400).json({
          success: false,
          data: [],
          error: 'Search query parameter "q" is required.'
        } as StandardApiResponse<[]>);
        return;
      }

      const { songs, provider } = await musicService.search(query, limit);

      res.status(200).json({
        success: true,
        data: songs,
        provider
      } as StandardApiResponse<typeof songs>);
    } catch (error) {
      logger.error('MusicController', 'Search error', { error: serializeError(error) });
      res.status(500).json({
        success: false,
        data: [],
        error: 'Failed to process search request.'
      } as StandardApiResponse<[]>);
    }
  }

  static async getTrending(_req: Request, res: Response): Promise<void> {
    try {
      const { songs, provider } = await musicService.getTrending(25);
      res.status(200).json({
        success: true,
        data: songs,
        provider
      } as StandardApiResponse<typeof songs>);
    } catch (error) {
      logger.error('MusicController', 'Get trending error', { error: serializeError(error) });
      res.status(500).json({
        success: false,
        data: [],
        error: 'Failed to fetch trending music.'
      } as StandardApiResponse<[]>);
    }
  }

  static async getSongById(req: Request, res: Response): Promise<void> {
    try {
      const songId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!songId) {
        res.status(400).json({
          success: false,
          data: null,
          error: 'Song ID is required.'
        });
        return;
      }

      const song = await musicService.getSongById(songId);
      if (!song) {
        res.status(404).json({
          success: false,
          data: null,
          error: `Song with ID "${songId}" was not found.`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: song,
        provider: song.provider
      });
    } catch (error) {
      logger.error('MusicController', 'Get song error', { error: serializeError(error) });
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to retrieve song details.'
      });
    }
  }

  static async getAlbumById(req: Request, res: Response): Promise<void> {
    try {
      const albumId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!albumId) {
        res.status(400).json({
          success: false,
          data: null,
          error: 'Album ID is required.'
        });
        return;
      }

      const album = await musicService.getAlbumById(albumId);
      if (!album) {
        res.status(404).json({
          success: false,
          data: null,
          error: `Album with ID "${albumId}" was not found.`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: album,
        provider: album.provider
      });
    } catch (error) {
      logger.error('MusicController', 'Get album error', { error: serializeError(error) });
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to retrieve album details.'
      });
    }
  }

  static async getArtistById(req: Request, res: Response): Promise<void> {
    try {
      const artistId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!artistId) {
        res.status(400).json({
          success: false,
          data: null,
          error: 'Artist ID is required.'
        });
        return;
      }

      const artist = await musicService.getArtistById(artistId);
      if (!artist) {
        res.status(404).json({
          success: false,
          data: null,
          error: `Artist with ID "${artistId}" was not found.`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: artist,
        provider: artist.provider
      });
    } catch (error) {
      logger.error('MusicController', 'Get artist error', { error: serializeError(error) });
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to retrieve artist details.'
      });
    }
  }

  static async getPlaylistById(req: Request, res: Response): Promise<void> {
    try {
      const playlistId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!playlistId) {
        res.status(400).json({
          success: false,
          data: null,
          error: 'Playlist ID is required.'
        });
        return;
      }

      const playlist = await musicService.getPlaylistById(playlistId);
      if (!playlist) {
        res.status(404).json({
          success: false,
          data: null,
          error: `Playlist with ID "${playlistId}" was not found.`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: playlist,
        provider: playlist.provider
      });
    } catch (error) {
      logger.error('MusicController', 'Get playlist error', { error: serializeError(error) });
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to retrieve playlist details.'
      });
    }
  }

  static async getSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const songId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const limit = parseInt((req.query.limit || '10').toString(), 10);
      if (!songId) {
        res.status(400).json({
          success: false,
          data: [],
          error: 'Song ID parameter is required for suggestions.'
        });
        return;
      }

      const suggestions = await musicService.getSuggestions(songId, limit);
      res.status(200).json({
        success: true,
        data: suggestions
      });
    } catch (error) {
      logger.error('MusicController', 'Get suggestions error', { error: serializeError(error) });
      res.status(500).json({
        success: false,
        data: [],
        error: 'Failed to retrieve song suggestions.'
      });
    }
  }
}
