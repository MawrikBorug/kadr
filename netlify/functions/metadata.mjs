/**
 * KADR metadata proxy for the authenticated full-version PWA.
 * This file intentionally contains NO credentials; configure env vars on the host.
 * Do not enable on a public site before the Supabase session gate is available.
 */
const SOURCES = Object.freeze({
  tmdb: { base: 'https://api.themoviedb.org', secret: 'TMDB_READ_TOKEN' },
  omdb: { base: 'https://www.omdbapi.com', secret: 'OMDB_API_KEY' },
  kpu: { base: 'https://kinopoiskapiunofficial.tech', secret: 'KPU_API_KEY' },
  kinopoisk: { base: 'https://api.kinopoisk.dev', secret: 'POISKKINO_API_KEY' }
});
const ALLOWED_PARAMS = {
  tmdb: new Set(['query','include_adult','language','page','year','first_air_date_year','include_image_language','append_to_response']),
  omdb: new Set(['i','t','y','plot','r']),
  kpu: new Set(['imdbId','keyword','page']),
  kinopoisk: new Set(['query','page','limit'])
};
const reFor = {
  tmdb: /^\/3\/(?:configuration|search\/(?:movie|tv)|(?:movie|tv)\/\d+(?:\/(?:credits|external_ids))?)$/,
  omdb: /^\/$/,
  kpu: /^\/api\/v2\.2\/films(?:\/\d+)?$/,
  kinopoisk: /^\/v1\.4\/movie\/(?:search|\d+)$/
};
export function validatedUpstream(provider, path, rawQuery = '') {
  if (!SOURCES[provider] || !reFor[provider].test(path)) throw Error('invalid upstream route');
  if (rawQuery.length > 1500) throw Error('query too long');
  const pairs = new URLSearchParams(rawQuery);
  const url = new URL(path, SOURCES[provider].base);
  if ([...pairs].length > 12) throw Error('too many query parameters');
  for (const [key, value] of pairs) {
    if (!ALLOWED_PARAMS[provider].has(key) || value.length > 200) throw Error('invalid parameter');
    if (key === 'append_to_response' && !/^[a-z_,]+$/.test(value)) throw Error('invalid appended resource');
    url.searchParams.append(key, value);
  }
  return url;
}
const json = (code, data, origin = '') => ({
  statusCode: code,
  headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
    'Vary':'Origin', ...(origin?{'Access-Control-Allow-Origin':origin}:{}) },
  body: JSON.stringify(data)
});
async function authenticated(accessToken) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !anon || !/^\S{20,}$/.test(accessToken)) return false;
  try {
    const result = await fetch(base + '/auth/v1/user', {
      headers: { apikey: anon, Authorization: 'Bearer ' + accessToken },
      signal: AbortSignal.timeout(5000)
    });
    if (!result.ok) return false;
    const user = await result.json();
    return Boolean(user && user.id);
  } catch { return false; }
}
const cache = new Map(), TTL = 6 * 3600 * 1000;
function fromCache(key) {
  const c=cache.get(key); if (!c) return null;
  if (c.expires < Date.now()) {cache.delete(key);return null;}
  return c.payload;
}
function intoCache(key, payload) {
  if (cache.size >= 200) cache.delete(cache.keys().next().value);
  cache.set(key,{payload,expires:Date.now()+TTL});
}
export async function handler(event) {
  const requestedOrigin = event.headers?.origin || event.headers?.Origin || '';
  const allowedOrigin = process.env.KADR_ALLOWED_ORIGIN || '';
  if (!allowedOrigin || (requestedOrigin && requestedOrigin !== allowedOrigin))
    return json(403,{error:'origin not allowed'});
  if (event.httpMethod !== 'GET') return json(405,{error:'method not allowed'},requestedOrigin);
  // Origin is not authentication. Every call must carry a valid account JWT.
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match || !(await authenticated(match[1])))
    return json(401,{error:'authentication required'},requestedOrigin);
  const {provider, path, query} = event.queryStringParameters || {};
  let upstream;
  try {upstream=validatedUpstream(provider||'',path||'',query||'');}
  catch {return json(400,{error:'invalid metadata request'},requestedOrigin);}
  const key = process.env[SOURCES[provider].secret];
  if (!key) return json(503,{error:'provider not configured'},requestedOrigin);
  const cacheKey = provider+':'+upstream.href, cached = fromCache(cacheKey);
  if (cached) return json(200,cached,requestedOrigin);
  const headers = {Accept:'application/json'};
  if (provider==='tmdb') headers.Authorization='Bearer '+key;
  else if (provider==='omdb') upstream.searchParams.set('apikey',key);
  else headers['X-API-KEY']=key;
  try {
    const response = await fetch(upstream,{headers,signal:AbortSignal.timeout(10000)});
    const raw = await response.text();
    if (raw.length > 1000000) return json(502,{error:'upstream too large'},requestedOrigin);
    let body;try {body=JSON.parse(raw);}catch {return json(502,{error:'bad upstream JSON'},requestedOrigin);}
    if (response.ok) intoCache(cacheKey,body);
    // Only return provider details. Never reflect any request credential.
    return json(response.status,body,requestedOrigin);
  } catch {return json(502,{error:'provider unavailable'},requestedOrigin);}
}
