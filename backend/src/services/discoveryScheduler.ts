import { config } from '../config/config.js';
import { discoveryRefreshService, SECTION_ORDER } from './discoveryRefreshService.js';
import type { DiscoverySectionKey } from '../models/discoverySnapshot.model.js';
import { logger } from '../utils/logger.js';

let timer: NodeJS.Timeout | undefined;
let lastRunMinute = '';

const getZonedTime = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: config.discoveryTimezone, minute: 'numeric', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  return { minute: Number(parts.find(part => part.type === 'minute')?.value), hour: Number(parts.find(part => part.type === 'hour')?.value) };
};

const getBaseTimes = (): Array<{ hour: number; minute: number }> => config.discoveryRefreshCrons.flatMap((cron) => {
  const [minute, hour] = cron.split(/\s+/);
  const parsedMinute = Number(minute); const parsedHour = Number(hour);
  return Number.isInteger(parsedMinute) && Number.isInteger(parsedHour) ? [{ minute: parsedMinute, hour: parsedHour }] : [];
});

const sectionDueNow = (date: Date): DiscoverySectionKey | null => {
  const { hour, minute } = getZonedTime(date);
  for (const base of getBaseTimes()) {
    const offset = (hour * 60 + minute) - (base.hour * 60 + base.minute);
    const index = offset / config.discoverySectionIntervalMinutes;
    if (Number.isInteger(index) && index >= 0 && index < SECTION_ORDER.length) return SECTION_ORDER[index];
  }
  return null;
};

export function startDiscoveryScheduler(): void {
  if (timer) return;
  logger.info('DiscoveryScheduler', 'Started', {
    timezone: config.discoveryTimezone, baseCrons: config.discoveryRefreshCrons,
    sectionIntervalMinutes: config.discoverySectionIntervalMinutes, startupRefresh: config.discoveryRefreshOnStartup
  });
  if (config.discoveryRefreshOnStartup) void discoveryRefreshService.refreshDiscoverySections();
  else void discoveryRefreshService.refreshIfStale();
  timer = setInterval(() => {
    const now = new Date(); const marker = now.toISOString().slice(0, 16); const section = sectionDueNow(now);
    if (section && marker !== lastRunMinute) { lastRunMinute = marker; void discoveryRefreshService.refreshSection(section); }
  }, 30_000);
}

export function stopDiscoveryScheduler(): void { if (timer) clearInterval(timer); timer = undefined; }
