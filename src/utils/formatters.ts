export const formatDuration = (seconds: number): string => {
  if (!seconds || isNaN(seconds) || seconds < 0) {
    return '0:00';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export const getTrackUrl = (trackId: string): string => {
  return `https://www.jamendo.com/track/${encodeURIComponent(trackId)}`;
};

export const getArtistUrl = (artistId: string): string => {
  return `https://www.jamendo.com/artist/${encodeURIComponent(artistId)}`;
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
