/**
 * KADR metadata gateway (Netlify Function).
 * No provider token is sent to the browser. Requires a separately provisioned
 * authenticated site/session gate before production exposure.
 */
const SOURCES = {
  tmdb: { base: 'https://api.themoviedb.org', secret: 'TMDB_READ_TOKEN' },
  omdb: { base: 'https://www.omdbapi.com', secret: 'OMDB_API_KEY' },
  kpu: { base: 'https://kinopoiskapiunofficial.tech', secret: 'KPU_API_KEY' },
  kinopoisk: { base: 'https://api.kinopoisk.dev', secret: 'POISKKINO_API_KEY' }
};
const okPath = (provider, path) => {
  switch (provider) {
    case 'tmdb': return /^\/3\/(?:configuration|search\/(?:movie|tv)|(?:movie|tv)\/\d+(?:\/(?:credits|external_ids))?)$/.test(path);
    case 'omdb': return path === '/';
    case 'kpu': return /^\/api\/(?:v2\.1\/films\/search-by-keyword|v2\.2\/films\/\d+)$/.test(path);
    case 'kinopoisk': return /^\/v1\.4\/movie\/(?:search|\d+)$/.test(path);
    default: return false;
  }
};
const PARAMS = {
  tmdb: new Set(['query','include_adult','language','page','year','first_air_date_year','include_image_language','append_to_response']),
  omdb: new Set(['i','t','y','plot','r']),
  kpu: new Set(['keyword','page']),
  kinopoisk: new Set(['query','page','limit'])
};
export function validatedUpstream(provider, path, rawQuery = '') {
  if (!SOURCES[provider] || !okPath(provider, path)) throw new Error('unsupported provider or route');
  if (rawQuery.length > 1500) throw new Error('query too long');
  const inParams = new URLSearchParams(rawQuery), url = new URL(path, SOURCES[provider].base);
  for (const [key, value] of inParams) {
    if (!PARAMS[provider].has(key) || value.length > 200) throw new Error('invalid parameter');
    url.searchParams.append(key, value);
  }
  return url;
}
const reply = (statusCode, body, origin = '') => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {})
  },
  body: JSON.stringify(body)
});
export async function handler(event) {
  const requestedOrigin = event.headers?.origin || event.headers?.Origin || '';
  const allowedOrigin = process.env.KADR_ALLOWED_ORIGIN || '';
  // This CORS guard is not authentication. Put the gateway behind app session
  // authorization before publicly enabling it.
  if (!allowedOrigin || (requestedOrigin && requestedOrigin !== allowedOrigin))
    return reply(403, { error: 'site origin not configured or allowed' });
  if (event.httpMethod !== 'GET') return reply(405, { error: 'method not allowed' }, requestedOrigin);
  const { provider, path, query } = event.queryStringParameters || {};
  let url;
  try { url = validatedUpstream(provider || '', path || '', query || ''); }
  catch (_) { return reply(400, { error: 'invalid metadata request' }, requestedOrigin); }
  const key = process.env[SOURCES[provider].secret];
  if (!key) return reply(503, { error: 'metadata provider not configured' }, requestedOrigin);
  const headers = { Accept: 'application/json' };
  if (provider === 'tmdb') headers.Authorization = 'Bearer ' + key;
  else if (provider === 'omdb') url.searchParams.set('apikey', key);
  else headers['X-API-KEY'] = key;
  try {
    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    const value = await resp.text();
    // Reject unexpected upstream body to avoid persisting provider errors or HTML.
    if (value.length > 1000000) return reply(502, { error: 'upstream response too large' }, requestedOrigin);
    let body;
    try { body = JSON.parse(value); }
    catch (_) { return reply(502, { error: 'invalid upstream JSON' }, requestedOrigin); }
    return reply(resp.status, body, requestedOrigin);
  } catch (_) {
    return reply(502, { error: 'metadata provider unavailable' }, requestedOrigin);
  }
}
