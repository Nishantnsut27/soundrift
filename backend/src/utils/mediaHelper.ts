export interface QualityUrl {
  quality: string;
  url: string;
}

function normalizeArtworkUrl(url: string): string {
  return url
    .replace(/\/50x50\//g, '/500x500/')
    .replace(/\/90x90\//g, '/500x500/')
    .replace(/\/150x150\//g, '/500x500/')
    .replace(/_50x50/g, '_500x500')
    .replace(/_90x90/g, '_500x500')
    .replace(/_150x150/g, '_500x500');
}

export function extractBestImage(imageSource: string | QualityUrl[] | undefined | null, fallback = '/placeholder-album.svg'): string {
  if (!imageSource) return fallback;
  if (typeof imageSource === 'string') return normalizeArtworkUrl(imageSource);
  if (Array.isArray(imageSource) && imageSource.length > 0) {
    const highQuality = imageSource.find(img => img.quality === '500x500');
    if (highQuality?.url) return normalizeArtworkUrl(highQuality.url);
    const medQuality = imageSource.find(img => img.quality === '150x150');
    if (medQuality?.url) return normalizeArtworkUrl(medQuality.url);
    return normalizeArtworkUrl(imageSource[imageSource.length - 1].url || fallback);
  }
  return fallback;
}

export function extractBestAudioUrl(downloadUrlSource: string | QualityUrl[] | undefined | null, fallback = ''): string {
  if (!downloadUrlSource) return fallback;
  if (typeof downloadUrlSource === 'string') return downloadUrlSource;
  if (Array.isArray(downloadUrlSource) && downloadUrlSource.length > 0) {
    const q320 = downloadUrlSource.find(audio => audio.quality === '320kbps');
    if (q320?.url) return q320.url;
    const q160 = downloadUrlSource.find(audio => audio.quality === '160kbps');
    if (q160?.url) return q160.url;
    const q96 = downloadUrlSource.find(audio => audio.quality === '96kbps');
    if (q96?.url) return q96.url;
    return downloadUrlSource[downloadUrlSource.length - 1].url || fallback;
  }
  return fallback;
}

export function extractFallbackAudioUrl(downloadUrlSource: string | QualityUrl[] | undefined | null, primary: string): string {
  if (!Array.isArray(downloadUrlSource) || downloadUrlSource.length === 0) return primary;
  const ordered = ['160kbps', '96kbps', '48kbps', '12kbps'];
  for (const quality of ordered) {
    const match = downloadUrlSource.find(audio => audio.quality === quality);
    if (match?.url && match.url !== primary) return match.url;
  }
  const distinct = downloadUrlSource.find(audio => audio.url && audio.url !== primary);
  return distinct?.url || primary;
}
