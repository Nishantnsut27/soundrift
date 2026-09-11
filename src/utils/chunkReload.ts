const RETRY_KEY = 'soundrift_chunk_reload';
const RETRY_MARKER = '#soundrift_chunk_reload';

function hasRetried(): boolean {
  try {
    if (sessionStorage.getItem(RETRY_KEY) === '1') return true;
  } catch {
    /* Storage is blocked, so the marker below is the only record of a retry. */
  }
  try {
    return window.name.includes(RETRY_MARKER);
  } catch {
    return false;
  }
}

/**
 * Records the retry and reports whether that record will survive the reload.
 * A mark that cannot be read back would reload forever, so the caller treats a
 * false here as "cannot recover" and surfaces the original error instead.
 */
function markRetry(): boolean {
  try {
    sessionStorage.setItem(RETRY_KEY, '1');
    if (sessionStorage.getItem(RETRY_KEY) === '1') return true;
  } catch {
    /* Private modes and storage-partitioned frames throw here; fall through. */
  }
  try {
    if (!window.name.includes(RETRY_MARKER)) window.name += RETRY_MARKER;
    return window.name.includes(RETRY_MARKER);
  } catch {
    return false;
  }
}

function clearRetry(): void {
  try {
    sessionStorage.removeItem(RETRY_KEY);
  } catch {
    /* Nothing was stored, so nothing needs clearing. */
  }
  try {
    if (window.name.includes(RETRY_MARKER)) {
      window.name = window.name.split(RETRY_MARKER).join('');
    }
  } catch {
    /* A stale marker only costs the next failure its retry. */
  }
}

/**
 * Wraps a route's dynamic import so that a deploy landing mid-session does not
 * strand the listener.
 *
 * The service worker registers with `autoUpdate`, so a new build activates and
 * clears the old precache while the page still holds the previous chunk names.
 * The next route change then asks for a file that no longer exists. One reload
 * picks up the new index and its new hashes; the flag makes it one reload and
 * not a loop, so a chunk that is genuinely broken still surfaces as an error.
 *
 * The flag has to outlive the reload it triggers. `sessionStorage` is the
 * natural home, but it throws outright in private modes and in frames whose
 * storage is partitioned, so `window.name` backs it up: same tab-scoped
 * lifetime, preserved across a same-origin reload, and unused elsewhere here.
 */
export function withChunkReload<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      const loaded = await load();
      clearRetry();
      return loaded;
    } catch (error) {
      if (hasRetried() || !markRetry()) throw error;
      window.location.reload();
      return new Promise<T>(() => {});
    }
  };
}
