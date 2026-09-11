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
   `/playlists/search` would otherwise be read as a playlist whose id is "search". */
musicRouter.get('/playlists/search', searchLimiter, validateSearchQuery, MusicController.searchPlaylists);

musicRouter.get('/song/:id', metadataLimiter, validateIdParameter, MusicController.getSongById);
musicRouter.get('/album/:id', metadataLimiter, validateIdParameter, MusicController.getAlbumById);
/* The last surviving artist route. There is no artist page; New Releases builds
   its arrivals feed from the featured artists' latest albums, and the catalogue
   offers no global new-releases endpoint to replace it. */
musicRouter.get('/artist/:id/albums', metadataLimiter, validateIdParameter, MusicController.getArtistAlbums);
musicRouter.get('/playlist/:id', metadataLimiter, validateIdParameter, MusicController.getPlaylistById);
musicRouter.get('/suggestions/:id', metadataLimiter, validateIdParameter, MusicController.getSuggestions);
