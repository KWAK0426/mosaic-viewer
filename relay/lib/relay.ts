const FILES: Record<string, { id: string; size: number }> = {
  'gaiphang-2026-10-15': { id: '14zyal0Ltsh2vUmwhgyHcedO4fo9vLuMF', size: 9985587 },
};
const ORIGINS = new Set(['https://kwak0426.github.io', 'http://127.0.0.1:8766']);

export async function relay(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const headers = new Headers({
    'Vary': 'Origin',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    'X-Content-Type-Options': 'nosniff',
  });
  if (origin && !ORIGINS.has(origin)) return new Response('Origin not allowed', { status: 403 });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  if (request.method === 'OPTIONS') {
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range');
    headers.set('Access-Control-Max-Age', '86400');
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
  const file = FILES[new URL(request.url).searchParams.get('observation') || ''];
  if (!file) return new Response('Unknown observation', { status: 404, headers });
  const match = /^bytes=(\d+)-(\d+)$/.exec(request.headers.get('range') || '');
  if (!match) return new Response('A single bounded byte range is required', { status: 400, headers });
  const start = Number(match[1]);
  const end = Math.min(Number(match[2]), file.size - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || end - start + 1 > 4194304) {
    headers.set('Content-Range', `bytes */${file.size}`);
    return new Response('Invalid range', { status: 416, headers });
  }
  try {
    const upstream = await fetch(`https://drive.usercontent.google.com/download?id=${file.id}&export=download`, {
      headers: { Range: `bytes=${start}-${end}` },
      signal: AbortSignal.timeout(20000),
      redirect: 'follow',
    });
    const expected = `bytes ${start}-${end}/${file.size}`;
    if (upstream.status !== 206 || upstream.headers.get('content-range') !== expected) {
      await upstream.body?.cancel();
      return new Response('Drive could not deliver the requested range', { status: 502, headers });
    }
    headers.set('Content-Type', 'image/tiff');
    headers.set('Content-Range', expected);
    headers.set('Content-Length', String(end - start + 1));
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=300');
    return new Response(upstream.body, { status: 206, headers });
  } catch {
    return new Response('Drive request timed out or failed', { status: 502, headers });
  }
}
