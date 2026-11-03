// Older controlling service workers do not have the audio routes. Probe the
// controller, rather than handing an audio element a URL that returns index.html.
let supported = false;
let initialized = false;
let generation = 0;
const listeners = new Set<() => void>();

export function canServeCachedAudio(): boolean { return supported; }

export function subscribeCachedAudioRoute(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function initializeCachedAudioRoute(): void {
  if (initialized || !('serviceWorker' in navigator)) return;
  initialized = true;
  const probe = () => {
    const attempt = ++generation;
    const previouslySupported = supported;
    supported = false;
    if (previouslySupported) listeners.forEach(listener => listener());
    const controller = navigator.serviceWorker.controller;
    if (!controller || typeof MessageChannel === 'undefined') return;
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); }, 3_000);
    channel.port1.onmessage = (event: MessageEvent) => {
      clearTimeout(timer);
      channel.port1.close();
      if (attempt !== generation || event.data?.audioCacheVersion !== 1) return;
      supported = true;
      listeners.forEach(listener => listener());
    };
    try { controller.postMessage({ type: 'SOUNDRIFT_AUDIO_CACHE_VERSION' }, [channel.port2]); }
    catch { clearTimeout(timer); channel.port1.close(); }
  };
  navigator.serviceWorker.addEventListener('controllerchange', probe);
  probe();
}
