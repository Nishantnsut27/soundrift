import {
  Song,
  Album,
  Artist,
  Playlist,
  ArtistSummary,
  PlaylistSummary,
  PagedResult
} from '../models/music.model.js';

export type ArtistSortBy = 'popularity' | 'latest' | 'alphabetical';
export type ArtistSortOrder = 'asc' | 'desc';

export interface ArtistCatalogueOptions {
  page?: number;
  sortBy?: ArtistSortBy;
  sortOrder?: ArtistSortOrder;
}

export interface ArtistDetailOptions {
  songCount?: number;
  albumCount?: number;
}

/**
 * What a music provider must do, and what it may do.
 *
 * The required members are the ones every provider can honour. The optional
 * block below is deliberate: Jamendo has no artist catalogue paging, no artist
 * search and no editorial playlists, and giving it stubs that return empty
 * arrays would make "this provider cannot do it" indistinguishable from "there
 * were no results". Callers check for the method instead.
 */
export interface IMusicProvider {
  readonly name: 'jiosaavn' | 'jamendo';
  search(query: string, limit?: number): Promise<Song[]>;
  getSongById(id: string): Promise<Song | null>;
  getAlbumById(id: string): Promise<Album | null>;
  getArtistById(id: string, options?: ArtistDetailOptions): Promise<Artist | null>;
  getPlaylistById(id: string, limit?: number): Promise<Playlist | null>;
  getSuggestions(id: string, limit?: number): Promise<Song[]>;

  getArtistSongs?(id: string, options?: ArtistCatalogueOptions): Promise<PagedResult<Song>>;
  getArtistAlbums?(id: string, options?: ArtistCatalogueOptions): Promise<PagedResult<Album>>;
  searchArtists?(query: string, limit?: number): Promise<ArtistSummary[]>;
  searchAlbums?(query: string, limit?: number): Promise<Album[]>;
  searchPlaylists?(query: string, limit?: number): Promise<PlaylistSummary[]>;
}
