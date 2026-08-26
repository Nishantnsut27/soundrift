import { WifiOff, RefreshCw, RotateCcw } from 'lucide-react';

export function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="offline-page">
      <div className="offline-page-content">
        <div className="offline-icon-wrapper">
          <WifiOff size={64} strokeWidth={1.5} />
        </div>
        <h1 className="offline-title">No Internet Connection</h1>
        <p className="offline-message">
          You need an internet connection to stream music, browse your library, and search for tracks.
        </p>
        <div className="offline-actions">
          <button className="offline-btn offline-btn-primary" onClick={handleRetry}>
            <RotateCcw size={16} />
            Retry
          </button>
          <button className="offline-btn offline-btn-secondary" onClick={handleReload}>
            <RefreshCw size={16} />
            Reload
          </button>
        </div>
      </div>
      <p className="offline-brand">Soundrift &mdash; Drift Into Your Next Favorite.</p>
    </div>
  );
}
