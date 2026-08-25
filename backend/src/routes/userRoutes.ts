import { Router, type RequestHandler } from 'express';
import { UserController } from '../controllers/userController.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import { uploadAvatarMiddleware } from '../middleware/upload.middleware.js';

export const userRouter = Router();

// Protect all user feature routes
userRouter.use(authenticateUser as RequestHandler);

// Profile & Avatar Management (Cloudinary)
userRouter.get('/profile', UserController.getProfile as RequestHandler);
userRouter.put('/profile', UserController.updateProfile as RequestHandler);
userRouter.post('/avatar', uploadAvatarMiddleware as RequestHandler, UserController.uploadAvatar as RequestHandler);
userRouter.delete('/account', UserController.deleteAccount as RequestHandler);

userRouter.get('/search-history', UserController.getSearchHistory as RequestHandler);
userRouter.post('/search-history', UserController.addSearchHistory as RequestHandler);
userRouter.delete('/search-history/:query', UserController.removeSearchHistory as RequestHandler);
userRouter.delete('/search-history', UserController.clearSearchHistory as RequestHandler);

// Favorites
userRouter.get('/favorites', UserController.getFavorites as RequestHandler);
userRouter.post('/favorites', UserController.addFavorite as RequestHandler);
userRouter.delete('/favorites', UserController.clearFavorites as RequestHandler);
userRouter.delete('/favorites/:trackId', UserController.removeFavorite as RequestHandler);

// Playlists
userRouter.get('/playlists', UserController.getPlaylists as RequestHandler);
userRouter.post('/playlists', UserController.createPlaylist as RequestHandler);
userRouter.put('/playlists/:id', UserController.updatePlaylist as RequestHandler);
userRouter.delete('/playlists/:id', UserController.deletePlaylist as RequestHandler);

// Playlist Tracks
userRouter.post('/playlists/:id/tracks', UserController.addTrackToPlaylist as RequestHandler);
userRouter.delete('/playlists/:id/tracks/:trackId', UserController.removeTrackFromPlaylist as RequestHandler);
userRouter.put('/playlists/:id/tracks/reorder', UserController.reorderPlaylistTracks as RequestHandler);

// Recently Played & Listening History
userRouter.get('/recently-played', UserController.getRecentlyPlayed as RequestHandler);
userRouter.post('/recently-played', UserController.addRecentlyPlayed as RequestHandler);
userRouter.get('/history', UserController.getListeningHistory as RequestHandler);
userRouter.post('/history', UserController.recordListeningHistory as RequestHandler);
