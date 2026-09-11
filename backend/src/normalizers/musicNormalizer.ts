/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Song,
  Album,
  Playlist,
  Suggestion,
  ArtistCredit,
  PlaylistSummary
} from '../models/music.model.js';
import { extractBestImage, extractBestAudioUrl } from '../utils/mediaHelper.js';

function cleanText(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&#039;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

/** Turns a raw `{ id, name }`-ish entry into a credit, or null if it is unusable. */
function toCredit(raw: unknown): ArtistCredit | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as { id?: unknown; name?: unknown };
  const name = cleanText(typeof entry.name === 'string' ? entry.name : '');
  if (!name) return null;
  return { id: entry.id ? String(entry.id) : '', name };
}

function dedupeCredits(credits: ArtistCredit[]): ArtistCredit[] {
  const seen = new Set<string>();
  return credits.filter(credit => {
    const key = credit.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Who actually performs a song.
 *
 * JioSaavn's `artists.primary` is not ordered by importance — it mixes singers,
 * composers and lyricists together. For "Gehra Hua" its first entry is Irshad
 * Kamil, the lyricist, so reading `primary[0]` credited songs to the wrong person
 * and pointed every artist link at them.
 *
 * `artists.all` carries a `role` per credit (`singer`, `music`, `lyricist`,
 * `starring`), so singers are preferred when the field is present. The remaining
 * steps are fallbacks for payload shapes that omit it; the last one is a label,
 * not a guess at a name.
 */
function resolveArtistCredits(raw: any): ArtistCredit[] {
  const all = Array.isArray(raw?.artists?.all) ? raw.artists.all : [];
  const singers = all
    .filter((entry: any) => entry && typeof entry === 'object' && entry.role === 'singer')
    .map(toCredit)
    .filter((credit: ArtistCredit | null): credit is ArtistCredit => credit !== null);
  if (singers.length > 0) return dedupeCredits(singers);

  const primary = Array.isArray(raw?.artists?.primary)
    ? raw.artists.primary
        .map(toCredit)
        .filter((credit: ArtistCredit | null): credit is ArtistCredit => credit !== null)
    : [];
  if (primary.length > 0) return dedupeCredits(primary);

  if (typeof raw?.primaryArtists === 'string' && raw.primaryArtists.trim()) {
    const names = raw.primaryArtists
      .split(',')
      .map((name: string) => cleanText(name))
      .filter(Boolean);
    if (names.length > 0) {
      const id = typeof raw?.artistId === 'string' ? raw.artistId : '';
      return names.map((name: string, index: number) => ({ id: index === 0 ? id : '', name }));
    }
  }

  if (Array.isArray(raw?.singers)) {
    const names = raw.singers
      .filter((name: unknown): name is string => typeof name === 'string')
      .map((name: string) => cleanText(name))
      .filter(Boolean);
    if (names.length > 0) return names.map((name: string) => ({ id: '', name }));
  }

  return [];
}

export class MusicNormalizer {
  static normalizeJioSaavnSong(raw: any): Song {
    const credits = resolveArtistCredits(raw);
    const artistName = credits.length > 0
      ? credits.map(credit => credit.name).join(', ')
      : 'Unknown Artist';
    const primaryArtistId = credits.find(credit => credit.id)?.id
      || (typeof raw?.artistId === 'string' ? raw.artistId : '');

    const bestImage = extractBestImage(raw?.image || raw?.album?.image || raw?.images || raw?.thumbnail);
    const audioUrl = extractBestAudioUrl(raw?.downloadUrl || raw?.audio);

    const rawGenres = Array.isArray(raw?.musicinfo?.tags?.genres)
      ? raw.musicinfo.tags.genres.filter((g: unknown): g is string => typeof g === 'string' && g.trim().length > 0)
      : [];

    return {
      id: raw?.id || '',
      name: cleanText(raw.name || raw.title || 'Untitled Track'),
      duration: typeof raw.duration === 'number' ? raw.duration : parseInt(raw.duration || '0', 10),
      artist_name: artistName,
      artist_id: primaryArtistId,
      artists: credits.length > 0 ? credits : undefined,
      album_name: cleanText(raw.album?.name || (typeof raw.album === 'string' ? raw.album : '')),
      album_id: raw.album?.id || '',
      album_image: bestImage,
      image: bestImage,
      audio: audioUrl,
      audiodownload: audioUrl,
      license_ccurl: '',
      language: typeof raw?.language === 'string' ? cleanText(raw.language) : '',
      musicinfo: {
        tags: {
          genres: rawGenres,
          instruments: [],
          vartags: []
        }
      },
      provider: 'jiosaavn'
    };
  }

  static normalizeJamendoSong(raw: any): Song {
    const artwork = raw.image || raw.album_image || '/placeholder-album.svg';
    const audioUrl = raw.audio || raw.audiodownload || '';

    return {
      id: raw.id || '',
      name: cleanText(raw.name || 'Untitled Track'),
      duration: typeof raw.duration === 'number' ? raw.duration : parseInt(raw.duration || '0', 10),
      artist_name: cleanText(raw.artist_name || 'Unknown Artist'),
      artist_id: raw.artist_id || '',
      album_name: cleanText(raw.album_name || ''),
      album_id: raw.album_id || '',
      album_image: raw.album_image || artwork,
      image: artwork,
      audio: audioUrl,
      audiodownload: raw.audiodownload || audioUrl,
      license_ccurl: raw.license_ccurl || '',
      language: typeof raw?.language === 'string' ? cleanText(raw.language) : '',
      musicinfo: {
        tags: {
          genres: raw.musicinfo?.tags?.genres || [],
          instruments: raw.musicinfo?.tags?.instruments || [],
          vartags: raw.musicinfo?.tags?.vartags || []
        }
      },
      provider: 'jamendo'
    };
  }

  static normalizeJioSaavnAlbum(raw: any): Album {
    const image = extractBestImage(raw.image);
    const primaryArtist = raw.artists?.primary?.[0]?.name || raw.artist_name || raw.artist || 'Unknown Artist';
    const primaryArtistId = raw.artists?.primary?.[0]?.id || raw.artist_id || '';

    const songs = Array.isArray(raw.songs)
      ? raw.songs.map((song: any) => this.normalizeJioSaavnSong(song))
      : [];

    return {
      id: raw.id || '',
      name: cleanText(raw.name || raw.title || 'Untitled Album'),
      description: cleanText(raw.description || ''),
      year: raw.year || '',
      releasedate: raw.releaseDate || '',
      artist_id: primaryArtistId,
      artist_name: cleanText(primaryArtist),
      image,
      playCount: raw.playCount || 0,
      songCount: raw.songCount || songs.length,
      songs,
      provider: 'jiosaavn'
    };
  }

  static normalizeJamendoAlbum(raw: any): Album {
    const image = raw.image || '/placeholder-album.svg';

    return {
      id: raw.id || '',
      name: cleanText(raw.name || 'Untitled Album'),
      description: '',
      releasedate: raw.releasedate || '',
      artist_id: raw.artist_id || '',
      artist_name: cleanText(raw.artist_name || 'Unknown Artist'),
      image,
      songs: [],
      provider: 'jamendo'
    };
  }

  static normalizeJioSaavnPlaylistSummary(raw: any): PlaylistSummary {
    return {
      id: raw?.id ? String(raw.id) : '',
      name: cleanText(raw?.name || raw?.title || ''),
      image: extractBestImage(raw?.image),
      songCount: typeof raw?.songCount === 'number' ? raw.songCount : undefined,
      language: typeof raw?.language === 'string' ? cleanText(raw.language) : undefined,
      provider: 'jiosaavn'
    };
  }

  static normalizeJioSaavnPlaylist(raw: any): Playlist {
    const image = extractBestImage(raw.image);
    const tracks = Array.isArray(raw.songs)
      ? raw.songs.map((song: any) => this.normalizeJioSaavnSong(song))
      : [];

    return {
      id: raw.id || '',
      name: cleanText(raw.name || raw.title || 'Untitled Playlist'),
      tracks,
      image,
      description: cleanText(raw.description || ''),
      provider: 'jiosaavn'
    };
  }

  static normalizeSuggestion(song: Song): Suggestion {
    return {
      id: song.id,
      name: cleanText(song.name),
      artist_name: cleanText(song.artist_name),
      image: song.image,
      audio: song.audio,
      duration: song.duration,
      language: song.language,
      provider: song.provider
    };
  }
}
