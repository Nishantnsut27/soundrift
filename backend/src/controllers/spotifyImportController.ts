import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { SpotifyImportJobs } from '../services/spotifyImportJobs.js';

const jobs = new SpotifyImportJobs();
const paramId = (req: AuthenticatedRequest): string => String(req.params.jobId);

export const SpotifyImportController = {
  start(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { res.status(202).json({ success: true, data: jobs.start(req.user!._id.toString(), req.body?.url) }); }
    catch (error) { next(error); }
  },
  get(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, data: jobs.get(req.user!._id.toString(), paramId(req)) });
    } catch (error) { next(error); }
  },
  cancel(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try { jobs.cancel(req.user!._id.toString(), paramId(req)); res.json({ success: true }); }
    catch (error) { next(error); }
  },
};
