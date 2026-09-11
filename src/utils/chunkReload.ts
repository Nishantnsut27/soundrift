const RELOAD_FLAG = 'soundrift_chunk_reload';

function readFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === '1';
  } catch {
    return true;
  }
}

function writeFlag(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(RELOAD_FLAG, '1');
    else sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* Blocked storage only costs the retry, not the navigation. */
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
 */
export function withChunkReload<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      const loaded = await load();
      writeFlag(false);
      return loaded;
    } catch (error) {
      if (readFlag()) throw error;
      writeFlag(true);
      window.location.reload();
      return new Promise<T>(() => {});
    }
  };
}
