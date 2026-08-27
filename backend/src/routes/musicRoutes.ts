import { Router } from 'express';
import { MusicController } from '../controllers/musicController.js';
import { searchLimiter, searchSlowDown, metadataLimiter } from '../middleware/rateLimit.middleware.js';
import { validateSearchQuery, validateIdParameter } from '../middleware/validation.middleware.js';

export const musicRouter = Router();

musicRouter.get('/search', searchLimiter, searchSlowDown, validateSearchQuery, MusicController.search);
musicRouter.get('/trending', metadataLimiter, MusicController.getTrending);
musicRouter.get('/discovery', metadataLimiter, MusicController.getDiscovery);
musicRouter.get('/song/:id', metadataLimiter, validateIdParameter, MusicController.getSongById);
musicRouter.get('/album/:id', metadataLimiter, validateIdParameter, MusicController.getAlbumById);
musicRouter.get('/artist/:id', metadataLimiter, validateIdParameter, MusicController.getArtistById);
musicRouter.get('/playlist/:id', metadataLimiter, validateIdParameter, MusicController.getPlaylistById);
musicRouter.get('/suggestions/:id', metadataLimiter, validateIdParameter, MusicController.getSuggestions);
