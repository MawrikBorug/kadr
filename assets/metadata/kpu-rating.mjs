/**
 * Normalize Kinopoisk Unofficial ratings without accepting a title-only match.
 * Missing/ambiguous results never overwrite existing work metadata or IMDb IDs.
 */
export function normalizeKpuRating(body, { imdbId, year, type } = {}) {
  const normalizedImdb = String(imdbId || '').trim().toLowerCase();
  if (!/^tt\d{5,12}$/.test(normalizedImdb)) return null;
  const rows = Array.isArray(body?.items) ? body.items : [];
  const matched = rows.filter(row => {
    if (String(row.imdbId || '').trim().toLowerCase() !== normalizedImdb) return false;
    const itemYear = Number(row.year);
    if (year && itemYear && Number(year) !== itemYear) return false;
    const kind = String(row.type || '').toUpperCase();
    if (type === 'series' && kind && !['TV_SERIES','MINI_SERIES'].includes(kind)) return false;
    if (type !== 'series' && kind && ['TV_SERIES','MINI_SERIES'].includes(kind)) return false;
    return Number.isFinite(Number(row.ratingKinopoisk)) && Number(row.ratingKinopoisk) > 0
      && Number(row.ratingKinopoisk) <= 10 && Number.isFinite(Number(row.kinopoiskId));
  });
  // If the upstream returns several verified identities, do not pick the first.
  if (matched.length !== 1) return null;
  const item = matched[0];
  const votes = Number(item.ratingKinopoiskVoteCount);
  return {
    kinopoiskId: String(item.kinopoiskId),
    imdbId: normalizedImdb,
    rating: Number(item.ratingKinopoisk),
    votes: Number.isSafeInteger(votes) && votes > 0 ? votes : null,
    sourceUrl: 'https://www.kinopoisk.ru/film/' + String(item.kinopoiskId) + '/'
  };
}
