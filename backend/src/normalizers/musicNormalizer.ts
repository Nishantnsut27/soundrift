/* eslint-disable @typescript-eslint/no-explicit-any */
import { Song, Album, Artist, Playlist, Suggestion } from '../models/music.model.js';
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

export class MusicNormalizer {
  static normalizeJioSaavnSong(raw: any): Song {
    let rawArtists: string;
    if (Array.isArray(raw?.artists?.primary)) {
      const valid = raw.artists.primary.filter((a: unknown): a is { name?: unknown } => !!a && typeof a === 'object');
      rawArtists = valid.length > 0
        ? valid.map((a: { name?: unknown }) => String(a.name ?? '')).filter(Boolean).join(', ')
        : '';
    } else {
      rawArtists = '';
    }
    if (!rawArtists) {
      rawArtists = typeof raw?.primaryArtists === 'string' ? raw.primaryArtists : '';
    }
    if (!rawArtists && Array.isArray(raw?.singers)) {
      rawArtists = raw.singers.filter((s: unknown) => typeof s === 'string').join(', ');
    }
    if (!rawArtists) {
      rawArtists = 'Unknown Artist';
    }

    let primaryArtistId = typeof raw?.artistId === 'string' ? raw.artistId : '';
    if (Array.isArray(raw?.artists?.primary)) {
      for (const artist of raw.artists.primary) {
        if (artist && typeof artist === 'object' && artist.id) {
          primaryArtistId = String(artist.id);
          break;
        }
      }
    }

    const bestImage = extractBestImage(raw?.image || raw?.album?.image || raw?.images || raw?.thumbnail);
    const audioUrl = extractBestAudioUrl(raw?.downloadUrl || raw?.audio);

    const rawGenres = Array.isArray(raw?.musicinfo?.tags?.genres)
      ? raw.musicinfo.tags.genres.filter((g: unknown): g is string => typeof g === 'string' && g.trim().length > 0)
      : [];

    return {
      id: raw?.id || '',
      name: cleanText(raw.name || raw.title || 'Untitled Track'),
      duration: typeof raw.duration === 'number' ? raw.duration : parseInt(raw.duration || '0', 10),
      artist_name: cleanText(rawArtists),
      artist_id: primaryArtistId,
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

  static normalizeJioSaavnArtist(raw: any): Artist {
    const image = extractBestImage(raw.image);
    const topSongs = Array.isArray(raw.topSongs)
      ? raw.topSongs.map((song: any) => this.normalizeJioSaavnSong(song))
      : [];
    const topAlbums = Array.isArray(raw.topAlbums)
      ? raw.topAlbums.map((album: any) => this.normalizeJioSaavnAlbum(album))
      : [];

    return {
      id: raw.id || '',
      name: cleanText(raw.name || raw.title || 'Unknown Artist'),
      website: raw.wiki || raw.url || '',
      joindate: raw.dob || '',
      image,
      followerCount: raw.followerCount || 0,
      bio: cleanText(Array.isArray(raw.bio) ? raw.bio.map((b: any) => b.text).join(' ') : (raw.bio || '')),
      topSongs,
      topAlbums,
      provider: 'jiosaavn'
    };
  }

  static normalizeJamendoArtist(raw: any): Artist {
    return {
      id: raw.id || '',
      name: cleanText(raw.name || 'Unknown Artist'),
      website: raw.website || '',
      joindate: raw.joindate || '',
      image: raw.image || '/placeholder-artist.svg',
      provider: 'jamendo'
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
