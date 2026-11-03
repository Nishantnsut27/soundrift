import { AUDIO_POLICY } from './audioPreparation';

export interface AudioBufferStatus {
  target: number;
  total: number;
  ready: number;
  contiguousReady: number;
  downloading: boolean;
  failed: number;
  bytes: number;
  limited: 'offline' | 'data-saver' | 'buffering' | 'paused' | 'storage' | null;
}

const empty: AudioBufferStatus = { target: AUDIO_POLICY.normal, total: 0, ready: 0, contiguousReady: 0, downloading: false, failed: 0, bytes: 0, limited: null };
let snapshot = empty;
const listeners = new Set<() => void>();
export const getAudioBufferStatus = () => snapshot;
export const subscribeAudioBufferStatus = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function setAudioBufferStatus(next: AudioBufferStatus): void {
  if (Object.keys(next).every(key => next[key as keyof AudioBufferStatus] === snapshot[key as keyof AudioBufferStatus])) return;
  snapshot = next;
  listeners.forEach(listener => listener());
}
export function resetAudioBufferStatus(): void { setAudioBufferStatus(empty); }
