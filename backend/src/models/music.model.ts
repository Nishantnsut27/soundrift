/** One credited person, with the id needed to open their artist page. */
export interface ArtistCredit {
  id: string;
  name: string;
}

export interface Song {
  id: string;
  name: string;
  duration: number;
  artist_name: string;
  artist_id: string;
  /**
   * Every credited performer, in order, each with its own id.
   *
   * `artist_name` is a display string and `artist_id` is only the first entry here,
   * so neither can link a song with several singers to more than one artist page.
   * Optional: Jamendo rows and songs already stored in Mongo do not carry it.
   */
  artists?: ArtistCredit[];
  album_name: string;
  album_id: string;
  album_image: string;
  image: string;
  audio: string;
  audiodownload: string;
  license_ccurl: string;
  language?: string;
  musicinfo: {
    tags: {
      genres: string[];
      instruments: string[];
      vartags: string[];
    };
  };
  provider?: 'jiosaavn' | 'jamendo';
}

export interface Album {
  id: string;
  name: string;
  description?: string;
  year?: number | string;
  releasedate?: string;
  artist_id: string;
  artist_name: string;
  image: string;
  playCount?: number;
  songCount?: number;
  songs?: Song[];
  provider?: 'jiosaavn' | 'jamendo';
}

/** A search hit for a playlist. The songs arrive only when one is opened by id. */
export interface PlaylistSummary {
  id: string;
  name: string;
  image: string;
  songCount?: number;
  language?: string;
  provider?: 'jiosaavn' | 'jamendo';
}

/** A page of results plus the true size of the collection behind it. */
export interface PagedResult<T> {
  total: number;
  items: T[];
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Song[];
  createdAt?: number;
  updatedAt?: number;
  image?: string;
  description?: string;
  provider?: 'jiosaavn' | 'jamendo';
}

export interface Suggestion {
  id: string;
  name: string;
  artist_name: string;
  image: string;
  audio: string;
  duration: number;
  language?: string;
  provider?: 'jiosaavn' | 'jamendo';
}

export interface StandardApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  provider?: string;
}
