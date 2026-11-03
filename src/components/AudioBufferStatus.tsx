import { useSyncExternalStore } from 'react';
import { getAudioBufferStatus, subscribeAudioBufferStatus } from '../services/audioBufferStatus';

export function AudioBufferStatus() {
  const status = useSyncExternalStore(subscribeAudioBufferStatus, getAudioBufferStatus);
  if (!status.total) return null;
  const note = status.limited === 'offline' ? 'Offline'
    : status.limited === 'data-saver' ? 'Data Saver: downloads paused'
    : status.limited === 'storage' ? 'Device storage is limiting downloads'
    : status.downloading ? 'Preparing more songs'
    : status.failed ? 'Some songs could not be saved yet' : '';
  return (
    <div className="queue-buffer-status" role="status" aria-live="polite">
      <span>{status.contiguousReady} upcoming {status.contiguousReady === 1 ? 'song' : 'songs'} ready offline</span>
      <span className="queue-buffer-detail">{status.ready}/{status.total} saved{note ? ` · ${note}` : ''}</span>
    </div>
  );
}
