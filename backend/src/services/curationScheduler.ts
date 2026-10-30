import { curationService, type SectionRefreshOutcome } from './curationService.js';
import { curatedSectionRepository } from './curatedSectionRepository.js';
import {
  CURATION_ENGINE_CONFIG,
  CURATION_SCHEDULE,
  type CuratedSectionId
} from '../config/curationConfig.js';
import { config } from '../config/config.js';
import { logger, serializeError } from '../utils/logger.js';

const SCOPE = 'CurationScheduler';
const DAY_MS = 24 * 60 * 60 * 1000;

interface ScheduledJob {
  sectionId: CuratedSectionId;
  hour: number;
  minute: number;
  cycle: number;
}

interface ZonedClock {
  year: number;
  month: number;
  day: number;
  /** Zoned wall-clock time minus UTC, in ms. */
  offsetMs: number;
}

export function buildScheduledJobs(): ScheduledJob[] {
  const jobs: ScheduledJob[] = [];

  CURATION_SCHEDULE.cycleStartTimes.forEach((start, cycleIndex) => {
    CURATION_SCHEDULE.sectionOrder.forEach((sectionId, sectionIndex) => {
      const totalMinutes =
        start.hour * 60 + start.minute + sectionIndex * CURATION_SCHEDULE.sectionIntervalMinutes;

      jobs.push({
        sectionId,
        hour: Math.floor(totalMinutes / 60) % 24,
        minute: totalMinutes % 60,
        cycle: cycleIndex + 1
      });
    });
  });

  return jobs;
}

function getZonedClock(nowMs: number): ZonedClock {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CURATION_SCHEDULE.timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const parts = formatter.formatToParts(new Date(nowMs));
  const lookup = (type: string): number => parseInt(parts.find(part => part.type === type)?.value ?? '0', 10);

  const year = lookup('year');
  const month = lookup('month');
  const day = lookup('day');
  const wallMs = Date.UTC(year, month - 1, day, lookup('hour') % 24, lookup('minute'), lookup('second'));

  return { year, month, day, offsetMs: wallMs - Math.floor(nowMs / 1000) * 1000 };
}

/** Absolute time of the job's most recent occurrence at or before `nowMs`. */
function lastOccurrence(job: ScheduledJob, clock: ZonedClock, nowMs: number): number {
  const todayAt = Date.UTC(clock.year, clock.month - 1, clock.day, job.hour, job.minute) - clock.offsetMs;
  return todayAt <= nowMs ? todayAt : todayAt - DAY_MS;
}

/**
 * Every tick compares each section's generation time with its most recent scheduled slot and
 * queues the ones that are behind. Matching slots by exact minute (the previous approach) silently
 * dropped any slot the process slept, restarted or deployed through.
 */
export class CurationScheduler {
  private timer: NodeJS.Timeout | null = null;
  private readonly pendingTimers = new Set<NodeJS.Timeout>();
  private readonly jobs = buildScheduledJobs();
  private readonly satisfiedSlots = new Map<CuratedSectionId, number>();
  private readonly attempts = new Map<string, { count: number; lastAttemptAt: number }>();
  private readonly queuedSections = new Set<CuratedSectionId>();
  private queue: Promise<void> = Promise.resolve();
  private checking = false;
  private started = false;
  private ignoreSlotsBefore = 0;

  start(): void {
    if (this.started) {
      logger.warn(SCOPE, 'Scheduler start ignored: already running');
      return;
    }

    if (!config.curationSchedulerEnabled) {
      logger.info(SCOPE, 'Curation scheduler disabled by configuration');
      return;
    }

    this.started = true;
    this.ignoreSlotsBefore = config.curationBackfillOnStartup ? 0 : Date.now();

    this.timer = setInterval(() => {
      void this.tick();
    }, CURATION_ENGINE_CONFIG.schedulerTickMs);
    this.timer.unref?.();
    this.delay(CURATION_ENGINE_CONFIG.startupBackfillDelayMs).then(() => this.tick());

    logger.info(SCOPE, 'Curation scheduler started', {
      timezone: CURATION_SCHEDULE.timezone,
      configuredKeys: config.groqApiKeys.length,
      backfillOnStartup: config.curationBackfillOnStartup,
      schedule: this.jobs.map(job => ({
        cycle: job.cycle,
        sectionId: job.sectionId,
        at: `${String(job.hour).padStart(2, '0')}:${String(job.minute).padStart(2, '0')}`
      }))
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    for (const timer of this.pendingTimers) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
    this.started = false;

    logger.info(SCOPE, 'Curation scheduler stopped');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.pendingTimers.delete(timer);
        resolve();
      }, ms);
      timer.unref?.();
      this.pendingTimers.add(timer);
    });
  }

  private latestSlotBySection(nowMs: number): Map<CuratedSectionId, number> {
    const clock = getZonedClock(nowMs);
    const latest = new Map<CuratedSectionId, number>();
    for (const job of this.jobs) {
      const slot = lastOccurrence(job, clock, nowMs);
      if (slot > (latest.get(job.sectionId) ?? -Infinity)) {
        latest.set(job.sectionId, slot);
      }
    }
    return latest;
  }

  private canAttempt(sectionId: CuratedSectionId, slot: number, nowMs: number): boolean {
    const attempt = this.attempts.get(`${sectionId}@${slot}`);
    if (!attempt) return true;
    if (attempt.count >= CURATION_ENGINE_CONFIG.maxRefreshAttemptsPerSlot) return false;
    return nowMs - attempt.lastAttemptAt >= CURATION_ENGINE_CONFIG.failedRefreshRetryMs;
  }

  private async tick(): Promise<void> {
    if (!this.started || this.checking) return;
    this.checking = true;

    try {
      const nowMs = Date.now();
      this.pruneAttempts(nowMs);

      const pending = [...this.latestSlotBySection(nowMs)].filter(([sectionId, slot]) =>
        slot >= this.ignoreSlotsBefore
        && (this.satisfiedSlots.get(sectionId) ?? -Infinity) < slot
        && !this.queuedSections.has(sectionId)
        && this.canAttempt(sectionId, slot, nowMs)
      );
      if (pending.length === 0) return;

      const generatedAt = await curatedSectionRepository.getGenerationTimes();
      for (const [sectionId, slot] of pending) {
        if ((generatedAt.get(sectionId) ?? 0) >= slot) {
          this.satisfiedSlots.set(sectionId, slot);
          continue;
        }
        this.enqueue(sectionId, slot);
      }
    } catch (error) {
      logger.error(SCOPE, 'Scheduler tick failed; will retry on the next tick', { error: serializeError(error) });
    } finally {
      this.checking = false;
    }
  }

  /** Refreshes run one at a time so a wake-up with many stale sections doesn't burst the Groq keys. */
  private enqueue(sectionId: CuratedSectionId, slot: number): void {
    this.queuedSections.add(sectionId);
    logger.info(SCOPE, 'Section refresh queued', { sectionId, slot: new Date(slot).toISOString() });

    this.queue = this.queue.then(async () => {
      try {
        if (!this.started) return;
        const outcome = await this.runSection(sectionId, slot);
        this.recordOutcome(sectionId, slot, outcome);
        await this.delay(CURATION_ENGINE_CONFIG.startupBackfillSpacingMs);
      } finally {
        this.queuedSections.delete(sectionId);
      }
    }).catch(error => {
      logger.error(SCOPE, 'Queued section refresh failed', { sectionId, error: serializeError(error) });
    });
  }

  private recordOutcome(sectionId: CuratedSectionId, slot: number, outcome: SectionRefreshOutcome | null): void {
    if (outcome?.status === 'saved' || outcome?.reason === 'already_fresh') {
      this.satisfiedSlots.set(sectionId, slot);
      return;
    }
    // Another instance holds the lock; the next tick will see its result or retry the lock.
    if (outcome?.reason === 'refresh_in_progress') return;

    const key = `${sectionId}@${slot}`;
    const previous = this.attempts.get(key);
    this.attempts.set(key, { count: (previous?.count ?? 0) + 1, lastAttemptAt: Date.now() });
  }

  private async runSection(sectionId: CuratedSectionId, slot: number): Promise<SectionRefreshOutcome | null> {
    try {
      const outcome = await curationService.refreshSection(sectionId, { notBefore: new Date(slot) });
      logger.info(SCOPE, 'Section refresh finished', { ...outcome });
      return outcome;
    } catch (error) {
      logger.error(SCOPE, 'Section refresh threw unexpectedly', { sectionId, error: serializeError(error) });
      return null;
    }
  }

  private pruneAttempts(nowMs: number): void {
    for (const key of this.attempts.keys()) {
      const slot = Number(key.slice(key.lastIndexOf('@') + 1));
      if (nowMs - slot > 2 * DAY_MS) {
        this.attempts.delete(key);
      }
    }
  }
}

export const curationScheduler = new CurationScheduler();
