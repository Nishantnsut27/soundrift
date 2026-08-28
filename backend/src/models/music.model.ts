export interface Song {
  id: string;
  name: string;
  duration: number;
  artist_name: string;
  artist_id: string;
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

export interface Artist {
  id: string;
  name: string;
  website?: string;
  joindate?: string;
  image: string;
  followerCount?: number;
  bio?: string;
  topSongs?: Song[];
  topAlbums?: Album[];
  provider?: 'jiosaavn' | 'jamendo';
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
