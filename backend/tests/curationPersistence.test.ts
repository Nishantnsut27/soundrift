import assert from 'node:assert/strict';
import { test } from 'node:test';
import axios from 'axios';
import { config } from '../src/config/config.js';
import { CurationSearchModel, CurationSearchBudgetModel } from '../src/models/curationSearch.model.js';
import { TavilyService } from '../src/services/tavilyService.js';
import { CurationService } from '../src/services/curationService.js';
import { curatedSectionRepository } from '../src/services/curatedSectionRepository.js';
import { CuratedSectionModel } from '../src/models/curatedSection.model.js';
import type { Song } from '../src/models/music.model.js';
import { buildScheduledJobs } from '../src/services/curationScheduler.js';

const queryResult = <T>(value: T) => ({ lean: () => ({ exec: async () => value }), exec: async () => value });
const stats = { rawCandidateCount: 10, validCandidateCount: 10, duplicateCandidatesRemoved: 0, resolvedCount: 10, unresolvedCount: 0, duplicateTracksRemoved: 0 };
const tracks = Array.from({ length: 10 }, (_, index) => ({ id: String(index), name: `Track ${index}`, artist_name: 'Singer', duration: 180, audio: 'https://audio.example/song', provider: 'jiosaavn' } as Song));

test('a cached query uses no network or budget, even after constructing another service', async t => {
  const key = config.tavilyApiKey; config.tavilyApiKey = 'test-only'; t.after(() => { config.tavilyApiKey = key; });
  const sources = [{ url: 'https://indianexpress.com/music', title: 'News', content: 'Article' }];
  t.mock.method(CurationSearchModel, 'findById', () => queryResult({ state: 'ready', sources }));
  const network = t.mock.method(axios, 'post', async () => { throw new Error('Unexpected network call'); });
  const budget = t.mock.method(CurationSearchBudgetModel, 'updateOne', () => { throw new Error('Unexpected credit reservation'); });
  for (let i = 0; i < 2; i++) assert.deepEqual(await new TavilyService().search('query', new Date()), { sources, status: 'cached' });
  assert.equal(network.mock.callCount(), 0); assert.equal(budget.mock.callCount(), 0);
});

test('monthly exhaustion and database failures fail closed before network access', async t => {
  const key = config.tavilyApiKey; config.tavilyApiKey = 'test-only'; t.after(() => { config.tavilyApiKey = key; });
  t.mock.method(CurationSearchModel, 'findById', () => queryResult(null));
  t.mock.method(CurationSearchModel, 'create', async () => ({}));
  t.mock.method(CurationSearchModel, 'updateOne', () => queryResult({}));
  t.mock.method(CurationSearchBudgetModel, 'updateOne', () => queryResult({}));
  t.mock.method(CurationSearchBudgetModel, 'findOneAndUpdate', (filter: { requests: { $lt: number } }) => {
    assert.equal(typeof filter.requests.$lt, 'number');
    return queryResult(null);
  });
  const network = t.mock.method(axios, 'post', async () => { throw new Error('Unexpected network call'); });
  assert.equal((await new TavilyService().search('query', new Date())).status, 'budget_exhausted');
  t.mock.method(CurationSearchModel, 'findById', () => { throw new Error('DB down'); });
  assert.equal((await new TavilyService().search('query', new Date())).status, 'unavailable');
  assert.equal(network.mock.callCount(), 0);
});

test('concurrent daily requests claim a single search and reserve credit before making it', async t => {
  const key = config.tavilyApiKey; config.tavilyApiKey = 'test-only'; t.after(() => { config.tavilyApiKey = key; });
  let claimed = false;
  let reserved = false;
  t.mock.method(CurationSearchModel, 'findById', () => queryResult(null));
  t.mock.method(CurationSearchModel, 'create', async () => {
    if (claimed) throw Object.assign(new Error('Duplicate key'), { code: 11000 });
    claimed = true; return {};
  });
  t.mock.method(CurationSearchModel, 'updateOne', () => queryResult({}));
  t.mock.method(CurationSearchBudgetModel, 'updateOne', () => queryResult({}));
  t.mock.method(CurationSearchBudgetModel, 'findOneAndUpdate', () => { reserved = true; return queryResult({ requests: 1 }); });
  const network = t.mock.method(axios, 'post', async (_url: string, body: Record<string, unknown>) => {
    assert(reserved); assert.equal(body.search_depth, 'basic'); assert.equal(body.auto_parameters, false);
    assert.equal(body.include_answer, false);
    return { data: { results: [{ url: 'https://indianexpress.com/music', title: 'Article', content: 'Supported text' }, { url: 'https://spam.example/page', content: 'Spam' }] } };
  });
  const results = await Promise.all([new TavilyService().search('query', new Date()), new TavilyService().search('query', new Date())]);
  assert.equal(network.mock.callCount(), 1);
  assert.equal(results.flatMap(result => result.sources).length, 1);
});

test('failed/undersized refreshes keep the old section; successful refresh publishes once', async t => {
  t.mock.method(curatedSectionRepository, 'acquireRefreshLock', async () => true);
  t.mock.method(curatedSectionRepository, 'renewRefreshLock', async () => true);
  t.mock.method(curatedSectionRepository, 'releaseRefreshLock', async () => {});
  t.mock.method(curatedSectionRepository, 'findBySectionId', async () => ({ sectionId: 'trending', title: 'Trending', tracks: [], generatedAt: new Date(0), updatedAt: new Date(0), refreshCount: 7, strategy: 'ai' }));
  const replace = t.mock.method(curatedSectionRepository, 'replaceSection', async (value: Parameters<typeof curatedSectionRepository.replaceSection>[0]) => {
    assert.equal(value.expectedRefreshCount, 7);
    assert.equal(value.strategy, 'editorial_web');
    return value;
  });
  let mode = 'few';
  const service = new CurationService(undefined, { generate: async () => {
    if (mode === 'throw') throw new Error('Provider down');
    return { tracks: mode === 'few' ? tracks.slice(0, 2) : tracks, stats, provenance: [], llmModel: '', webStatus: 'disabled' };
  } });
  assert.equal((await service.refreshSection('trending')).status, 'kept_previous');
  mode = 'throw'; assert.equal((await service.refreshSection('trending')).status, 'kept_previous');
  assert.equal(replace.mock.callCount(), 0);
  mode = 'full'; assert.equal((await service.refreshSection('trending')).status, 'saved');
  assert.equal(replace.mock.callCount(), 1);
});

test('lost lock prevents publication and an optimistic write rejects a newer generation', async t => {
  t.mock.method(curatedSectionRepository, 'acquireRefreshLock', async () => true);
  t.mock.method(curatedSectionRepository, 'renewRefreshLock', async () => false);
  t.mock.method(curatedSectionRepository, 'releaseRefreshLock', async () => {});
  t.mock.method(curatedSectionRepository, 'findBySectionId', async () => null);
  const update = t.mock.method(CuratedSectionModel, 'findOneAndUpdate', (filter: { refreshCount: number }, _update: unknown, options: { upsert?: boolean }) => {
    assert.equal(filter.refreshCount, 4); assert(!options.upsert); return queryResult(null);
  });
  const service = new CurationService(undefined, { generate: async () => ({ tracks, stats, provenance: [], llmModel: '', webStatus: 'disabled' }) });
  assert.equal((await service.refreshSection('trending')).reason, 'refresh_lock_lost');
  assert.equal(update.mock.callCount(), 0);
  await assert.rejects(() => curatedSectionRepository.replaceSection({ sectionId: 'trending', title: 'Trending', tracks,
    stats, strategy: 'editorial_web', provenance: [], webStatus: 'disabled', llmModel: '', expectedRefreshCount: 4 }));
});

test('homepage and individual-section reads never generate or search; chart rows may overlap', async t => {
  const records = ['trending', 'fresh_releases'].map(sectionId => ({ sectionId, title: sectionId, tracks,
    generatedAt: new Date(0), updatedAt: new Date(0), refreshCount: 1, strategy: 'editorial_web' }));
  t.mock.method(curatedSectionRepository, 'findAll', async () => records);
  t.mock.method(curatedSectionRepository, 'findBySectionId', async () => records[0]);
  const network = t.mock.method(axios, 'post', async () => { throw new Error('No external calls allowed'); });
  const service = new CurationService(undefined, { generate: async () => { throw new Error('No generation allowed'); } });
  service.invalidateReadCache();
  const all = await service.getAllSections();
  assert.equal(all.length, 2); assert(all.every(section => section.tracks.length === 10 && section.stale));
  assert.equal((await service.getSection('trending'))?.tracks.length, 10);
  assert.equal(network.mock.callCount(), 0);
});

test('default daily cycle starts at 03:00 with no afternoon cycle', () => {
  const jobs = buildScheduledJobs();
  assert.equal(jobs.length, 10);
  assert.deepEqual(jobs[0], { sectionId: 'trending', hour: 3, minute: 0, cycle: 1 });
});
