/* Audio bytes are explicitly downloaded by the player, never cached as partial
   streaming responses. This handler owns only our two local media namespaces. */
async function cachedAudioResponse(request, cacheName) {
  const stored = await (await caches.open(cacheName)).match(request.url);
  if (!stored) return new Response('Audio is not cached', { status: 404 });
  const blob = await stored.blob();
  const headers = new Headers(stored.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(blob.size));
  const range = request.headers.get('Range');
  if (!range) return new Response(blob, { headers });
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  const invalid = () => new Response(null, { status: 416,
    headers: { 'Content-Range': `bytes */${blob.size}`, 'Accept-Ranges': 'bytes' } });
  if (!match || (!match[1] && !match[2]) || !blob.size) return invalid();
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return invalid();
    start = Math.max(0, blob.size - suffix);
    end = blob.size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : blob.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= blob.size || end < start) return invalid();
    end = Math.min(end, blob.size - 1);
  }
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Content-Range', `bytes ${start}-${end}/${blob.size}`);
  return new Response(blob.slice(start, end + 1, blob.type), { status: 206, headers });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET' || request.mode === 'navigate') return;
  const cacheName = url.pathname.startsWith('/__soundrift-audio__/') ? 'soundrift-audio-v1'
    : url.pathname.startsWith('/__soundrift-offline__/') ? 'soundrift-offline-v1' : null;
  if (cacheName) event.respondWith(cachedAudioResponse(request, cacheName).catch(() => new Response(null, { status: 503 })));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SOUNDRIFT_AUDIO_CACHE_VERSION') {
    event.ports[0]?.postMessage({ audioCacheVersion: 1 });
  }
});
