import { Router } from 'express';
import { MusicController } from '../controllers/musicController.js';
import { CurationController } from '../controllers/curationController.js';
import { searchLimiter, searchSlowDown, metadataLimiter } from '../middleware/rateLimit.middleware.js';
import { validateSearchQuery, validateIdParameter } from '../middleware/validation.middleware.js';

export const musicRouter = Router();

musicRouter.get('/search', searchLimiter, searchSlowDown, validateSearchQuery, MusicController.search);
musicRouter.get('/trending', metadataLimiter, MusicController.getTrending);
musicRouter.get('/curated', metadataLimiter, CurationController.getSections);
musicRouter.get('/curated/:section', metadataLimiter, CurationController.getSection);

/* Registered before the `/:id` routes below. Express matches in order, so
   `/artists/search` would otherwise be read as an artist whose id is "search". */
musicRouter.get('/artists/search', searchLimiter, validateSearchQuery, MusicController.searchArtists);
musicRouter.get('/artists/resolve', searchLimiter, validateSearchQuery, MusicController.resolveArtist);
musicRouter.get('/playlists/search', searchLimiter, validateSearchQuery, MusicController.searchPlaylists);

musicRouter.get('/song/:id', metadataLimiter, validateIdParameter, MusicController.getSongById);
musicRouter.get('/album/:id', metadataLimiter, validateIdParameter, MusicController.getAlbumById);
musicRouter.get('/artist/:id', metadataLimiter, validateIdParameter, MusicController.getArtistById);
musicRouter.get('/artist/:id/songs', metadataLimiter, validateIdParameter, MusicController.getArtistSongs);
musicRouter.get('/artist/:id/albums', metadataLimiter, validateIdParameter, MusicController.getArtistAlbums);
musicRouter.get('/playlist/:id', metadataLimiter, validateIdParameter, MusicController.getPlaylistById);
musicRouter.get('/suggestions/:id', metadataLimiter, validateIdParameter, MusicController.getSuggestions);
