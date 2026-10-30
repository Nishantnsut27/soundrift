import axios from 'axios';
import { createHash } from 'node:crypto';
import { config } from '../config/config.js';
import { LIVE_CURATION_CONFIG } from '../config/liveCurationConfig.js';
import { CurationSearchModel, CurationSearchBudgetModel, type SearchSource } from '../models/curationSearch.model.js';
import { logger } from '../utils/logger.js';

export const isTavilyConfigured = (): boolean => LIVE_CURATION_CONFIG.enabled && Boolean(config.tavilyApiKey);

export function indiaDate(now: Date): string {
  return new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

export function isAllowedSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      LIVE_CURATION_CONFIG.sourceDomains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}

export interface SearchResult {
  sources: SearchSource[];
  status: 'ready' | 'cached' | 'unavailable' | 'disabled' | 'budget_exhausted';
}

/** A pending daily query is deliberately not retried after a crash. Editorial data still works. */
export class TavilyService {
  async search(query: string, now: Date): Promise<SearchResult> {
    if (!isTavilyConfigured()) return { sources: [], status: 'disabled' };
    const day = indiaDate(now);
    const id = createHash('sha256').update(JSON.stringify({ version: 1, day, query, domains: LIVE_CURATION_CONFIG.sourceDomains })).digest('hex');
    try {
      const cached = await CurationSearchModel.findById(id).lean().exec();
      if (cached) return { sources: cached.state === 'ready' ? cached.sources : [], status: cached.state === 'ready' ? 'cached' : 'unavailable' };
      try {
        await CurationSearchModel.create({ _id: id, state: 'pending', sources: [], fetchedAt: now, expiresAt: new Date(now.getTime() + 8 * 86400000) });
      } catch (error) {
        if ((error as { code?: number }).code === 11000) return { sources: [], status: 'unavailable' };
        throw error;
      }

      for (let attempt = 0; attempt < 2; attempt++) {
        // Recompute the month for each attempt in case a job spans midnight/month-end.
        const month = indiaDate(new Date()).slice(0, 7);
        try {
          await CurationSearchBudgetModel.updateOne({ _id: month }, { $setOnInsert: { requests: 0 } }, { upsert: true }).exec();
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) throw error;
        }
        const budget = await CurationSearchBudgetModel.findOneAndUpdate(
          { _id: month, requests: { $lt: LIVE_CURATION_CONFIG.monthlySearchLimit } },
          { $inc: { requests: 1 } }, { new: true }
        ).lean().exec();
        if (!budget) {
          await CurationSearchModel.updateOne({ _id: id }, { $set: { state: 'failed' } }).exec();
          return { sources: [], status: 'budget_exhausted' };
        }

        try {
          const response = await axios.post('https://api.tavily.com/search', {
            query, topic: 'general', country: 'india', time_range: 'week',
            search_depth: 'basic', max_results: 6, include_answer: false,
            include_raw_content: true, auto_parameters: false,
            include_domains: LIVE_CURATION_CONFIG.sourceDomains
          }, {
            headers: { Authorization: `Bearer ${config.tavilyApiKey}` },
            timeout: LIVE_CURATION_CONFIG.requestTimeoutMs,
            maxContentLength: 1024 * 1024,
            maxRedirects: 0
          });
          if (!Array.isArray(response.data?.results)) throw new Error('Invalid Tavily response');
          const sources: SearchSource[] = response.data.results.flatMap((raw: unknown) => {
            if (!raw || typeof raw !== 'object') return [];
            const item = raw as Record<string, unknown>;
            if (typeof item.url !== 'string' || !isAllowedSourceUrl(item.url) || typeof item.content !== 'string') return [];
            const content = `${item.content.slice(0, 1500)}\n${typeof item.raw_content === 'string' ? item.raw_content.slice(0, 2500) : ''}`;
            return [{ url: item.url.slice(0, 2000), title: typeof item.title === 'string' ? item.title.slice(0, 300) : '', content }];
          }).slice(0, 6);
          await CurationSearchModel.updateOne({ _id: id }, { $set: { state: 'ready', sources } }).exec();
          return { sources, status: 'ready' };
        } catch (error) {
          const status = axios.isAxiosError(error) ? error.response?.status : undefined;
          // Never log Axios errors/configs: they contain the Authorization header.
          logger.warn('TavilyService', 'Search attempt failed', { status, attempt: attempt + 1 });
          const transient = axios.isAxiosError(error) && (status === undefined || status === 429 || status >= 500);
          if (attempt === 0 && transient) {
            const retryAfter = Number(axios.isAxiosError(error) ? error.response?.headers?.['retry-after'] : 0);
            if (Number.isFinite(retryAfter) && retryAfter > 5) break;
            await new Promise(resolve => setTimeout(resolve, Math.max(1000, (retryAfter || 0) * 1000)));
            continue;
          }
          break;
        }
      }
      await CurationSearchModel.updateOne({ _id: id }, { $set: { state: 'failed' } }).exec();
    } catch {
      // Fail closed when persistence/budget checks fail; never make unmetered searches.
      logger.warn('TavilyService', 'Search unavailable; retaining editorial baseline');
    }
    return { sources: [], status: 'unavailable' };
  }
}
