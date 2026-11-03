import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Track } from '../types/types';

export interface NativeOfflineRecord { track: Track; size: number; savedAt: number }
interface NativeOfflinePlugin {
  offlineList(): Promise<{ records: NativeOfflineRecord[] }>;
  offlineSave(options: { track: Track }): Promise<void>;
  offlineRemove(options: { track: Track }): Promise<void>;
  offlineClear(): Promise<void>;
}
export const nativeOffline = registerPlugin<NativeOfflinePlugin>('SoundriftPlayback');
export const usesNativeOffline = () => Capacitor.isNativePlatform();
