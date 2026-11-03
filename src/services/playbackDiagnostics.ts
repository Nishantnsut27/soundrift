type Diagnostic = { at: number; event: string; visibility: string; online: boolean; details: Record<string, unknown> };
const STORAGE_KEY = 'soundrift-playback-diagnostics';
const events: Diagnostic[] = [];
let context: () => Record<string, unknown> = () => ({});

export function recordPlaybackDiagnostic(event: string, details: Record<string, unknown> = {}): void {
  events.push({ at: Date.now(), event, visibility: document.visibilityState, online: navigator.onLine,
    details: { ...context(), ...details } });
  if (events.length > 150) events.shift();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); } catch { /* optional */ }
}

/** Read-only export for real-device investigation; never stores URLs or credentials. */
export function initializePlaybackDiagnostics(getContext: () => Record<string, unknown>): void {
  context = getContext;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) events.push(...saved.slice(-100));
  } catch { /* optional */ }
  Object.defineProperty(window, 'soundriftPlaybackDiagnostics', { configurable: true,
    value: () => JSON.parse(JSON.stringify(events)) });
  recordPlaybackDiagnostic('initialized');
}
