import { curationService } from './curationService.js';
import { curatedSectionRepository } from './curatedSectionRepository.js';
import { isGroqConfigured } from './groqService.js';
import {
  CURATION_ENGINE_CONFIG,
  CURATION_SCHEDULE,
  CURATED_SECTIONS,
  type CuratedSectionId
} from '../config/curationConfig.js';
import { config } from '../config/config.js';
import { logger, serializeError } from '../utils/logger.js';

const SCOPE = 'CurationScheduler';

interface ScheduledJob {
  sectionId: CuratedSectionId;
  hour: number;
  minute: number;
  cycle: number;
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

function getIstNow(): { hour: number; minute: number; dateKey: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CURATION_SCHEDULE.timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const parts = formatter.formatToParts(new Date());
  const lookup = (type: string): string => parts.find(part => part.type === type)?.value ?? '00';

  const hour = parseInt(lookup('hour'), 10) % 24;

  return {
    hour,
    minute: parseInt(lookup('minute'), 10),
    dateKey: `${lookup('year')}-${lookup('month')}-${lookup('day')}`
  };
}

export class CurationScheduler {
  private timer: NodeJS.Timeout | null = null;
  private startupTimers: NodeJS.Timeout[] = [];
  private readonly jobs = buildScheduledJobs();
  private readonly runningSections = new Set<CuratedSectionId>();
  private readonly completedMarkers = new Set<string>();
  private cycleInProgress = false;
  private started = false;

  start(): void {
    if (this.started) {
      logger.warn(SCOPE, 'Scheduler start ignored: already running');
      return;
    }

    if (!config.curationSchedulerEnabled) {
      logger.info(SCOPE, 'Curation scheduler disabled by configuration');
      return;
    }

    if (!isGroqConfigured()) {
      logger.warn(SCOPE, 'Curation scheduler not started: no Groq API keys configured', {
        expectedVariables: 'GROQ_API_1..GROQ_API_6'
      });
      return;
    }

    this.started = true;
    this.timer = setInterval(() => {
      void this.tick();
    }, CURATION_ENGINE_CONFIG.schedulerTickMs);
    this.timer.unref?.();

    logger.info(SCOPE, 'Curation scheduler started', {
      timezone: CURATION_SCHEDULE.timezone,
      configuredKeys: config.groqApiKeys.length,
      schedule: this.jobs.map(job => ({
        cycle: job.cycle,
        sectionId: job.sectionId,
        atIst: `${String(job.hour).padStart(2, '0')}:${String(job.minute).padStart(2, '0')}`
      }))
    });

    if (config.curationBackfillOnStartup) {
      this.scheduleStartupBackfill();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    for (const timer of this.startupTimers) {
      clearTimeout(timer);
    }
    this.startupTimers = [];
    this.started = false;

    logger.info(SCOPE, 'Curation scheduler stopped');
  }

  private async tick(): Promise<void> {
    try {
      const now = getIstNow();
      const dueJobs = this.jobs.filter(job => job.hour === now.hour && job.minute === now.minute);

      for (const job of dueJobs) {
        const marker = `${now.dateKey} ${job.hour}:${job.minute} ${job.sectionId}`;
        if (this.completedMarkers.has(marker)) continue;

        this.completedMarkers.add(marker);
        this.pruneMarkers();

        const isCycleStart = job.sectionId === CURATION_SCHEDULE.sectionOrder[0];
        if (isCycleStart) {
          if (this.cycleInProgress) {
            logger.warn(SCOPE, 'Cycle start skipped: previous cycle is still running', { cycle: job.cycle });
          } else {
            this.cycleInProgress = true;
            logger.info(SCOPE, 'Curation cycle started', {
              cycle: job.cycle,
              timezone: CURATION_SCHEDULE.timezone,
              sections: CURATION_SCHEDULE.sectionOrder.length
            });
          }
        }

        const isCycleEnd = job.sectionId === CURATION_SCHEDULE.sectionOrder[CURATION_SCHEDULE.sectionOrder.length - 1];

        void this.runSection(job.sectionId, { cycle: job.cycle, trigger: 'schedule' }).finally(() => {
          if (isCycleEnd) {
            this.cycleInProgress = false;
            logger.info(SCOPE, 'Curation cycle completed', { cycle: job.cycle });
          }
        });
      }
    } catch (error) {
      logger.error(SCOPE, 'Scheduler tick failed', { error: serializeError(error) });
    }
  }

  private async runSection(
    sectionId: CuratedSectionId,
    context: { cycle?: number; trigger: 'schedule' | 'startup' | 'manual' }
  ): Promise<void> {
    if (this.runningSections.has(sectionId)) {
      logger.warn(SCOPE, 'Section refresh skipped: already running', { sectionId, ...context });
      return;
    }

    this.runningSections.add(sectionId);

    try {
      const outcome = await curationService.refreshSection(sectionId);
      logger.info(SCOPE, 'Section refresh finished', { ...context, ...outcome });
    } catch (error) {
      logger.error(SCOPE, 'Section refresh threw unexpectedly', {
        sectionId,
        ...context,
        error: serializeError(error)
      });
    } finally {
      this.runningSections.delete(sectionId);
    }
  }

  private scheduleStartupBackfill(): void {
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const stale = await curatedSectionRepository.findStaleOrMissingSectionIds(
            CURATION_ENGINE_CONFIG.staleAfterMs
          );

          if (stale.length === 0) {
            logger.info(SCOPE, 'Startup backfill skipped: all curated sections are fresh');
            return;
          }

          logger.info(SCOPE, 'Startup backfill started', { sections: stale, count: stale.length });

          for (let index = 0; index < stale.length; index++) {
            if (index > 0) {
              await new Promise(resolve => {
                const spacing = setTimeout(resolve, CURATION_ENGINE_CONFIG.startupBackfillSpacingMs);
                spacing.unref?.();
                this.startupTimers.push(spacing);
              });
            }

            await this.runSection(stale[index], { trigger: 'startup' });
          }

          logger.info(SCOPE, 'Startup backfill completed', { sections: stale.length });
        } catch (error) {
          logger.error(SCOPE, 'Startup backfill failed', { error: serializeError(error) });
        }
      })();
    }, CURATION_ENGINE_CONFIG.startupBackfillDelayMs);

    timer.unref?.();
    this.startupTimers.push(timer);
  }

  private pruneMarkers(): void {
    const maxMarkers = CURATED_SECTIONS.length * CURATION_SCHEDULE.cycleStartTimes.length * 2;
    while (this.completedMarkers.size > maxMarkers) {
      const oldest = this.completedMarkers.values().next().value;
      if (oldest === undefined) break;
      this.completedMarkers.delete(oldest);
    }
  }
}

export const curationScheduler = new CurationScheduler();
