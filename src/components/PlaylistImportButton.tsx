import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { FileJson, Link, Upload, X } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { useToastStore } from '../store/toastStore';
import { prepareSpotifyImport, type SpotifyImportProgress, type SpotifyImportResult } from '../services/spotifyImportApi';

export function PlaylistImportButton({ variant = 'default' }: { variant?: 'default' | 'sidebar' }) {
  const [open, setOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const importPlaylist = usePlayerStore(state => state.importPlaylist);
  const addToast = useToastStore(state => state.addToast);

  // The existing JSON file checks, parsing pipeline and notifications are retained.
  const importJson = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const isJsonExtension = file.name.toLowerCase().endsWith('.json');
      const isJsonMime = !file.type || file.type === 'application/json' || file.type === 'text/json';
      if (!isJsonExtension || !isJsonMime) {
        addToast({ type: 'error', title: 'Import Failed', message: 'Only .json playlist files are supported.' });
        event.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (loaded) => {
        const result = loaded.target?.result;
        if (typeof result === 'string') {
          try {
            importPlaylist(result);
            addToast({ type: 'success', title: 'Playlist Imported', message: 'Successfully imported playlist.' });
          } catch (error) {
            addToast({ type: 'error', title: 'Import Failed', message: error instanceof Error ? error.message : 'Failed to import playlist.' });
          }
        }
      };
      reader.readAsText(file);
    }
    event.target.value = '';
  };

  return <>
    <button type="button"
      className={`playlist-import-trigger ${variant === 'sidebar' ? 'playlist-import-trigger-sidebar' : 'sr-btn sr-btn-secondary'}`}
      onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
      <span className="playlist-import-trigger-icon"><Upload size={17} strokeWidth={1.8} aria-hidden="true" /></span>
      <span className="playlist-import-trigger-copy">
        <span>Import Playlist</span>
        {variant === 'sidebar' && <small>Spotify link or JSON</small>}
      </span>
    </button>
    <input ref={fileInput} type="file" accept=".json" onChange={importJson} hidden />
    {open && <PlaylistImportDialog onClose={() => setOpen(false)} onJson={() => {
      fileInput.current?.click();
      setOpen(false);
    }} />}
  </>;
}

function PlaylistImportDialog({ onClose, onJson }: { onClose: () => void; onJson: () => void }) {
  const [mode, setMode] = useState<'choose' | 'spotify'>('choose');
  const [link, setLink] = useState('');
  const [progress, setProgress] = useState<SpotifyImportProgress | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SpotifyImportResult | null>(null);
  const controller = useRef<AbortController | null>(null);
  const modal = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  const id = useId();

  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modal.current?.querySelector<HTMLButtonElement>('[data-initial-focus]')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), summary, a[href]') || []);
      const first = elements[0];
      const last = elements[elements.length - 1];
      const outside = !modal.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', keydown, true);
    const owner = useAuthStore.getState().user?.id;
    const unsubscribe = useAuthStore.subscribe(state => {
      if (state.user?.id !== owner || !state.isAuthenticated) { controller.current?.abort(); closeRef.current(); }
    });
    return () => {
      controller.current?.abort();
      unsubscribe();
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', keydown, true);
      previouslyFocused?.focus();
    };
  }, []);
  useEffect(() => {
    if (result) modal.current?.querySelector<HTMLElement>('.playlist-import-result')?.focus();
    else if (mode === 'spotify') input.current?.focus();
    else modal.current?.querySelector<HTMLButtonElement>('[data-initial-focus]')?.focus();
  }, [mode, result]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!link.trim() || controller.current) return;
    const owner = useAuthStore.getState().user?.id;
    const operation = new AbortController();
    controller.current = operation;
    setError('');
    setProgress({ phase: 'retrieving', processed: 0, total: 0 });
    try {
      const prepared = await prepareSpotifyImport(link.trim(), operation.signal, setProgress);
      operation.signal.throwIfAborted();
      if (!owner || useAuthStore.getState().user?.id !== owner) throw new Error('Please sign in again before importing.');
      // Same JSON parser, validation, duplicate detection, local storage and server sync as file import.
      usePlayerStore.getState().importPlaylist(JSON.stringify(prepared.playlist));
      setResult(prepared);
      useToastStore.getState().addToast({
        type: prepared.missing.length ? 'warning' : 'success',
        title: prepared.missing.length ? 'Playlist Partially Imported' : 'Playlist Imported',
        message: `Imported ${prepared.playlist.tracks.length} songs.${prepared.missing.length ? ` ${prepared.missing.length} items could not be matched and were skipped.` : ''}${prepared.duplicates ? ` ${prepared.duplicates} duplicates were skipped.` : ''}`,
        duration: prepared.missing.length ? 9000 : 3500,
      });
    } catch (cause) {
      if (!operation.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not import this playlist.');
    } finally {
      if (!operation.signal.aborted) { setProgress(null); controller.current = null; }
    }
  };

  return createPortal(
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div ref={modal} className="confirm-modal-container playlist-import-modal" role="dialog" aria-modal="true"
        aria-labelledby={`${id}-title`} onClick={event => event.stopPropagation()}>
        <div className="confirm-modal-header">
          <h2 id={`${id}-title`} className="confirm-modal-title">{result ? 'Playlist imported' : 'Import Playlist'}</h2>
          <button type="button" className="confirm-modal-close" onClick={onClose} aria-label={progress ? 'Cancel import and close' : 'Close import'}><X size={18} /></button>
        </div>
        {mode === 'choose' ? <div className="confirm-modal-body playlist-import-options">
          <p className="confirm-modal-message">Bring your music into Soundrift.</p>
          <button type="button" className="playlist-import-option" data-initial-focus onClick={onJson}>
            <FileJson size={23} aria-hidden="true" /><span><strong>Import JSON</strong><small>Choose a Soundrift playlist file.</small></span>
          </button>
          <button type="button" className="playlist-import-option" onClick={() => setMode('spotify')}>
            <Link size={23} aria-hidden="true" /><span><strong>Paste Your Spotify Link</strong><small>Import a public playlist. No Spotify login.</small></span>
          </button>
        </div> : result ? <>
          <div className="confirm-modal-body playlist-import-result" tabIndex={-1}>
            <p><strong>{result.playlist.name}</strong></p>
            <p className="confirm-modal-message">{result.playlist.tracks.length} songs imported from {result.total} playlist entries.</p>
            {result.duplicates > 0 && <p className="confirm-modal-message">{result.duplicates} duplicate songs were skipped.</p>}
            {result.missing.length > 0 && <details>
              <summary>{result.missing.length} items not imported</summary>
              <p className="confirm-modal-message">These could not be matched confidently. Some may still appear in search. All matched songs were imported.</p>
              <ul>{result.missing.map((item, index) => <li key={index}>{item.title}{item.artist ? ` — ${item.artist}` : ''}
                {item.reason === 'search_failed' && <small>Catalogue search was unavailable.</small>}</li>)}</ul>
            </details>}
          </div>
          <div className="confirm-modal-actions"><button type="button" className="btn btn-primary" onClick={() => {
            usePlayerStore.getState().setCurrentView('playlists');
            usePlayerStore.getState().closeSidebar();
            onClose();
          }}>View playlists</button></div>
        </> : <form onSubmit={submit}>
          <div className="confirm-modal-body playlist-import-form" aria-busy={!!progress}>
            <p id={`${id}-hint`} className="confirm-modal-message">Paste a public Spotify playlist link. We’ll find its songs in Soundrift and import the matches. Up to 500 entries per playlist.</p>
            <label htmlFor={`${id}-url`}>Spotify playlist link</label>
            <input ref={input} id={`${id}-url`} type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false}
              className="confirm-modal-input" placeholder="https://open.spotify.com/playlist/…" value={link}
              maxLength={2048} disabled={!!progress} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
              aria-invalid={!!error} onChange={event => { setLink(event.target.value); setError(''); }} />
            {progress && <div className="playlist-import-progress" role="status" aria-live="polite">
              <p>{progress.phase === 'retrieving' ? 'Retrieving your playlist…' : `Finding songs: ${progress.processed} of ${progress.total}`}</p>
              <progress max={progress.total || 1} value={progress.phase === 'matching' ? progress.processed : undefined} />
              <small>Large playlists can take a few minutes. Keep this window open.</small>
            </div>}
            {error && <p id={`${id}-error`} className="playlist-import-error" role="alert">{error}</p>}
          </div>
          <div className="confirm-modal-actions">
            <button type="button" className="btn btn-ghost" onClick={progress ? onClose : () => { setMode('choose'); setError(''); }}>{progress ? 'Cancel import' : 'Back'}</button>
            <button type="submit" className="btn btn-primary" disabled={!link.trim() || !!progress}>{progress ? 'Importing…' : 'Import playlist'}</button>
          </div>
        </form>}
      </div>
    </div>, document.body,
  );
}
