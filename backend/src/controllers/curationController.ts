import { Request, Response } from 'express';
import { curationService, type CuratedSectionPayload } from '../services/curationService.js';
import { StandardApiResponse } from '../models/music.model.js';
import { isCuratedSectionId } from '../config/curationConfig.js';
import { logger, serializeError } from '../utils/logger.js';

export class CurationController {
  static async getSections(_req: Request, res: Response): Promise<void> {
    try {
      const sections = await curationService.getAllSections();

      res.status(200).json({
        success: true,
        data: sections
      } as StandardApiResponse<CuratedSectionPayload[]>);
    } catch (error) {
      logger.error('CurationController', 'Get curated sections error', { error: serializeError(error) });
      res.status(500).json({
        success: false,
        data: [],
        error: 'Failed to fetch curated sections.'
      } as StandardApiResponse<[]>);
    }
  }

  static async getSection(req: Request, res: Response): Promise<void> {
    try {
      const rawSectionId = Array.isArray(req.params.section) ? req.params.section[0] : req.params.section;
      const sectionId = (rawSectionId || '').toString().trim();

      if (!isCuratedSectionId(sectionId)) {
        res.status(400).json({
          success: false,
          data: null,
          error: 'Unknown curated section identifier.'
        });
        return;
      }

      const section = await curationService.getSection(sectionId);

      if (!section) {
        res.status(404).json({
          success: false,
          data: null,
          error: `Curated section "${sectionId}" has no saved tracks yet.`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: section
      } as StandardApiResponse<CuratedSectionPayload>);
    } catch (error) {
      logger.error('CurationController', 'Get curated section error', { error: serializeError(error) });
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to fetch curated section.'
      });
    }
  }
}
