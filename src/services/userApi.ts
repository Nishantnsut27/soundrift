import { fetchJson, API_BASE_URL } from './apiClient';
import type { Track, Playlist } from '../types/types';

export interface SearchHistoryItem { query: string; searchedAt: string; }

const USER_BASE_URL = `${API_BASE_URL}/api/user`;
const AUTH_BASE_URL = `${API_BASE_URL}/api/auth`;

export const userApi = {
  // Favorites
  async getFavorites(): Promise<Track[]> {
    const res = await fetchJson<{ success: boolean; data: Track[] }>(`${USER_BASE_URL}/favorites`);
    return res.data || [];
  },

  async addFavorite(track: Track): Promise<Track> {
    const res = await fetchJson<{ success: boolean; data: Track }>(`${USER_BASE_URL}/favorites`, {
      method: 'POST',
      body: JSON.stringify({ trackData: track }),
    });
    return res.data;
  },

  async removeFavorite(trackId: string): Promise<void> {
    await fetchJson(`${USER_BASE_URL}/favorites/${encodeURIComponent(trackId)}`, {
      method: 'DELETE',
    });
  },

  async clearFavorites(): Promise<void> {
    await fetchJson(`${USER_BASE_URL}/favorites`, {
      method: 'DELETE',
    });
  },

  // Playlists
  async getPlaylists(): Promise<Playlist[]> {
    const res = await fetchJson<{ success: boolean; data: Playlist[] }>(`${USER_BASE_URL}/playlists`);
    return res.data || [];
  },

  async createPlaylist(name: string, description = ''): Promise<Playlist> {
    const res = await fetchJson<{ success: boolean; data: Playlist }>(`${USER_BASE_URL}/playlists`, {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
    return res.data;
  },

  async updatePlaylist(id: string, data: { name?: string; description?: string }): Promise<Playlist> {
    const res = await fetchJson<{ success: boolean; data: Playlist }>(`${USER_BASE_URL}/playlists/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async deletePlaylist(id: string): Promise<void> {
    await fetchJson(`${USER_BASE_URL}/playlists/${id}`, {
      method: 'DELETE',
    });
  },

  async addTrackToPlaylist(playlistId: string, track: Track): Promise<{ id: string; tracks: Track[] }> {
    const res = await fetchJson<{ success: boolean; data: { id: string; tracks: Track[] } }>(
      `${USER_BASE_URL}/playlists/${playlistId}/tracks`,
      {
        method: 'POST',
        body: JSON.stringify({ trackData: track }),
      }
    );
    return res.data;
  },

  async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<{ id: string; tracks: Track[] }> {
    const res = await fetchJson<{ success: boolean; data: { id: string; tracks: Track[] } }>(
      `${USER_BASE_URL}/playlists/${playlistId}/tracks/${encodeURIComponent(trackId)}`,
      {
        method: 'DELETE',
      }
    );
    return res.data;
  },

  async reorderPlaylistTracks(playlistId: string, tracks: Track[]): Promise<{ id: string; tracks: Track[] }> {
    const res = await fetchJson<{ success: boolean; data: { id: string; tracks: Track[] } }>(
      `${USER_BASE_URL}/playlists/${playlistId}/tracks/reorder`,
      {
        method: 'PUT',
        body: JSON.stringify({ tracks }),
      }
    );
    return res.data;
  },

  // Recently Played & Listening History
  async addRecentlyPlayed(track: Track): Promise<void> {
    await fetchJson(`${USER_BASE_URL}/recently-played`, {
      method: 'POST',
      body: JSON.stringify({ trackData: track }),
    }).catch(() => {});
  },

  async getRecentlyPlayed(): Promise<Track[]> {
    const res = await fetchJson<{ success: boolean; data: Track[] }>(`${USER_BASE_URL}/recently-played`);
    return res.data || [];
  },

  async getHistory(): Promise<Track[]> {
    const res = await fetchJson<{ success: boolean; data: Track[] }>(`${USER_BASE_URL}/history`);
    return res.data || [];
  },

  async recordHistory(track: Track, playDurationSeconds = 0, completed = false): Promise<void> {
    await fetchJson(`${USER_BASE_URL}/history`, {
      method: 'POST',
      body: JSON.stringify({ trackData: track, playDurationSeconds, completed }),
    }).catch(() => {});
  },

  async getSearchHistory(): Promise<SearchHistoryItem[]> {
    const res = await fetchJson<{ success: boolean; data: SearchHistoryItem[] }>(`${USER_BASE_URL}/search-history`);
    return res.data || [];
  },

  async addSearchHistory(query: string): Promise<void> {
    await fetchJson(`${USER_BASE_URL}/search-history`, {
      method: 'POST', body: JSON.stringify({ query }),
    });
  },

  async removeSearchHistory(query: string): Promise<void> {
    await fetchJson(`${USER_BASE_URL}/search-history/${encodeURIComponent(query)}`, { method: 'DELETE' });
  },

  async clearSearchHistory(): Promise<void> {
    await fetchJson(`${USER_BASE_URL}/search-history`, { method: 'DELETE' });
  },

  // Profile Management & Cloudinary Avatar Upload
  async updateProfile(data: { fullName?: string; avatar?: string }) {
    const res = await fetchJson<{ success: boolean; user: Record<string, unknown> }>(`${USER_BASE_URL}/profile`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.user;
  },

  async uploadAvatar(file: File): Promise<{ url: string; public_id: string }> {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await fetch(`${USER_BASE_URL}/avatar`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to upload avatar.');
    }

    return data.avatar;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await fetchJson(`${AUTH_BASE_URL}/change-password`, {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async deleteAccount(): Promise<void> {
    await fetchJson(`${USER_BASE_URL}/account`, {
      method: 'DELETE',
    });
  },
};
