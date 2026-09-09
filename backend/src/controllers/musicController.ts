import { Request, Response } from 'express';
import { MusicService } from '../services/musicService.js';
import { StandardApiResponse } from '../models/music.model.js';
import type { ArtistSortBy, ArtistSortOrder } from '../providers/musicProvider.interface.js';
import { logger, serializeError } from '../utils/logger.js';
import { discoveryRefreshService } from '../services/discoveryRefreshService.js';

const musicService = new MusicService();

/** Clamps a query value to a sane integer, so a hand-edited URL cannot ask for 10,000 rows. */
function parsePositiveInt(raw: unknown, fallback: number, max: number): number {
  const parsed = parseInt((raw ?? '').toString(), 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

/* The upstream API rejects anything outside these sets, so unknown values fall
   back to the default rather than being forwarded and turned into a 400. */
function parseArtistSortBy(raw: unknown): ArtistSortBy {
  const value = (raw ?? '').toString();
  return value === 'latest' || value === 'alphabetical' || value === 'popularity'
    ? value
    : 'popularity';
}

function parseArtistSortOrder(raw: unknown): ArtistSortOrder {
  return (raw ?? '').toString() === 'asc' ? 'asc' : 'desc';
}

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

      const artist = await musicService.getArtistById(artistId, {
        songCount: parsePositiveInt(req.query.songCount, 25, 50),
        albumCount: parsePositiveInt(req.query.albumCount, 15, 50)
      });
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

  static async getArtistSongs(req: Request, res: Response): Promise<void> {
    try {
      const artistId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!artistId) {
        res.status(400).json({ success: false, data: null, error: 'Artist ID is required.' });
        return;
      }

      const page = await musicService.getArtistSongs(artistId, {
        page: parsePositiveInt(req.query.page, 0, 50),
        sortBy: parseArtistSortBy(req.query.sortBy),
        sortOrder: parseArtistSortOrder(req.query.sortOrder)
      });

      res.status(200).json({ success: true, data: page });
    } catch (error) {
      logger.error('MusicController', 'Get artist songs error', { error: serializeError(error) });
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to retrieve songs for this artist.'
      });
    }
  }

  static async getArtistAlbums(req: Request, res: Response): Promise<void> {
    try {
      const artistId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!artistId) {
        res.status(400).json({ success: false, data: null, error: 'Artist ID is required.' });
        return;
      }

      const page = await musicService.getArtistAlbums(artistId, {
        page: parsePositiveInt(req.query.page, 0, 50),
        sortBy: parseArtistSortBy(req.query.sortBy),
        sortOrder: parseArtistSortOrder(req.query.sortOrder)
      });

      res.status(200).json({ success: true, data: page });
    } catch (error) {
      logger.error('MusicController', 'Get artist albums error', { error: serializeError(error) });
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to retrieve albums for this artist.'
      });
    }
  }

  /**
   * Name to artist entity.
   *
   * The one lookup that makes an artist page reachable from a track whose
   * `artist_id` is missing. Returns `data: null` rather than an error when
   * nothing matches — no match is an ordinary outcome, not a failure.
   */
  static async resolveArtist(req: Request, res: Response): Promise<void> {
    try {
      const query = (req.query.q || req.query.query || '').toString().trim();
      if (!query) {
        res.status(400).json({ success: false, data: null, error: 'Search query parameter "q" is required.' });
        return;
      }

      const artist = await musicService.resolveArtistByName(query);
      res.status(200).json({ success: true, data: artist });
    } catch (error) {
      logger.error('MusicController', 'Resolve artist error', { error: serializeError(error) });
      res.status(500).json({ success: false, data: null, error: 'Failed to resolve artist.' });
    }
  }

  static async searchArtists(req: Request, res: Response): Promise<void> {
    try {
      const query = (req.query.q || req.query.query || '').toString().trim();
      if (!query) {
        res.status(400).json({ success: false, data: [], error: 'Search query parameter "q" is required.' });
        return;
      }

      const artists = await musicService.searchArtists(query, parsePositiveInt(req.query.limit, 10, 30));
      res.status(200).json({ success: true, data: artists } as StandardApiResponse<typeof artists>);
    } catch (error) {
      logger.error('MusicController', 'Search artists error', { error: serializeError(error) });
      res.status(500).json({ success: false, data: [], error: 'Failed to search artists.' } as StandardApiResponse<[]>);
    }
  }

  static async searchPlaylists(req: Request, res: Response): Promise<void> {
    try {
      const query = (req.query.q || req.query.query || '').toString().trim();
      if (!query) {
        res.status(400).json({ success: false, data: [], error: 'Search query parameter "q" is required.' });
        return;
      }

      const playlists = await musicService.searchPlaylists(query, parsePositiveInt(req.query.limit, 10, 30));
      res.status(200).json({ success: true, data: playlists } as StandardApiResponse<typeof playlists>);
    } catch (error) {
      logger.error('MusicController', 'Search playlists error', { error: serializeError(error) });
      res.status(500).json({ success: false, data: [], error: 'Failed to search playlists.' } as StandardApiResponse<[]>);
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

      const playlist = await musicService.getPlaylistById(
        playlistId,
        parsePositiveInt(req.query.limit, 50, 100)
      );
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
