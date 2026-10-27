import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeKpuRating } from '../assets/metadata/kpu-rating.mjs';
import { validatedUpstream, handler } from '../netlify/functions/metadata.mjs';

const id = 'tt0816692';
const sample = (overrides={}) => ({
  kinopoiskId: 258687, imdbId:id, year:2014, type:'FILM',
  ratingKinopoisk:8.6, ratingKinopoiskVoteCount:90000, ...overrides
});

test('KPU rating accepts verified IMDb identity, year and format', () => {
  const item = normalizeKpuRating({items:[sample()]},{imdbId:id,year:2014,type:'film'});
  assert.equal(item.kinopoiskId,'258687');
  assert.equal(item.rating,8.6);
  assert.equal(item.votes,90000);
  assert.equal(item.sourceUrl,'https://www.kinopoisk.ru/film/258687/');
});

test('KPU rating does not attach a score to the wrong film', () => {
  const input={imdbId:id,year:2014,type:'film'};
  for (const variant of [
    sample({imdbId:'tt1234567'}),
    sample({year:2001}),
    sample({type:'TV_SERIES'}),
    sample({ratingKinopoisk:0}),
    sample({ratingKinopoisk:11}),
    sample({kinopoiskId:null})
  ]) assert.equal(normalizeKpuRating({items:[variant]},input),null);
  assert.equal(normalizeKpuRating({items:[sample(),sample({kinopoiskId:999})]},input),null);
  assert.equal(normalizeKpuRating({items:[]},input),null);
  assert.equal(normalizeKpuRating({items:[sample()]},{imdbId:'',year:2014,type:'film'}),null);
});

test('gateway only accepts explicitly permitted metadata paths and query keys', () => {
  assert.equal(validatedUpstream('tmdb','/3/movie/157336','language=ru-RU').hostname,'api.themoviedb.org');
  assert.equal(validatedUpstream('kpu','/api/v2.2/films','imdbId='+id).hostname,'kinopoiskapiunofficial.tech');
  assert.throws(()=>validatedUpstream('tmdb','/3/account/123','language=ru-RU'));
  assert.throws(()=>validatedUpstream('kpu','/api/v2.2/films','token=private'));
  assert.throws(()=>validatedUpstream('omdb','https://evil.test/','t=Hi'));
  assert.throws(()=>validatedUpstream('tmdb','/3/movie/157336','language=ru-RU&api_key=leaked'));
});

test('gateway refuses unauthenticated access before contacting providers',async()=>{
  const saved=process.env.KADR_ALLOWED_ORIGIN;
  process.env.KADR_ALLOWED_ORIGIN='https://example.test';
  try {
    const response=await handler({httpMethod:'GET',headers:{origin:'https://example.test'},queryStringParameters:{provider:'tmdb',path:'/3/movie/157336'}});
    assert.equal(response.statusCode,401);
  } finally {
    if(saved===undefined)delete process.env.KADR_ALLOWED_ORIGIN;else process.env.KADR_ALLOWED_ORIGIN=saved;
  }
});

test('public HTML has no bundled provider credentials and inline scripts parse',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const cfg=html.match(/window\.KADR_PROVIDER_CONFIG\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\);/);
  assert.ok(cfg,'provider config must exist');
  assert.doesNotMatch(cfg[1],/eyJ[A-Za-z0-9._-]{40,}/);
  assert.match(cfg[1],/tmdbToken:\s*''/);
  assert.match(html,/normalizeKpuRating/);
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(m=>!m[1].includes('src=')&&!/type=["'](?:application\/json|module)["']/i.test(m[1]));
  assert.ok(scripts.length>0);
  for(const [index,script] of scripts.entries()) assert.doesNotThrow(()=>new vm.Script(script[2],{filename:'inline-script-'+index+'.js'}));
});
