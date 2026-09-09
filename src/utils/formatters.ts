export const formatDuration = (seconds: number): string => {
  if (!seconds || isNaN(seconds) || seconds < 0) {
    return '0:00';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/**
 * Turns a timestamp the backend gave us into "just now" / "3 hours ago".
 *
 * Returns null for anything unparseable, or for a time in the future, so the
 * caller omits the line entirely rather than printing "Invalid Date" or a
 * nonsense freshness. Only ever call this with a real date from the API — a
 * fabricated "updated" time is worse than no time at all.
 */
export const formatRelativeTime = (isoDate: string): string | null => {
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return null;

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 0) return null;
  if (seconds < 90) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
};

export const formatArtistNames = (artistName: string, max = 2): string => {
  if (!artistName) return 'Unknown Artist';
  const artists = artistName
    .split(',')
    .map(a => a.trim())
    .filter(Boolean);

  if (artists.length === 0) return 'Unknown Artist';
  if (artists.length <= max) return artists.join(', ');

  const shown = artists.slice(0, max).join(', ');
  const extra = artists.length - max;
  return `${shown}, +${extra}`;
};
