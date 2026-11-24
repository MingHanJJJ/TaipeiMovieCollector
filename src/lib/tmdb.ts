// Minimal TMDB client + title matching. API docs: https://developer.themoviedb.org
export interface TmdbCandidate {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
  poster_path: string | null;
  popularity: number;
}

export const posterUrl = (path: string, size: "w185" | "w342" | "w500" = "w342") => `https://image.tmdb.org/t/p/${size}${path}`;

/** lower-case, strip whitespace/punctuation/symbols so "DUNE: PART THREE" == "dune part three" */
export const normalizeTitle = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");

export interface MovieQuery {
  titleZh: string;
  titleEn?: string | null;
  now?: Date;
}

/**
 * Pick the TMDB result that is really this film, or null. A wrong poster is worse than none,
 * so a title match (exact or containing) is mandatory; release date / popularity only break ties.
 */
export function pickBest(cands: TmdbCandidate[], q: MovieQuery): TmdbCandidate | null {
  const zh = normalizeTitle(q.titleZh);
  const en = q.titleEn ? normalizeTitle(q.titleEn) : "";
  const now = (q.now ?? new Date()).getTime();
  const MONTH = 30 * 24 * 3600_000;

  let best: { c: TmdbCandidate; score: number } | null = null;
  for (const c of cands) {
    const names = [c.title, c.original_title].filter(Boolean).map(normalizeTitle);
    const targets = [zh, en].filter((t) => t.length >= 2);
    let score = 0;
    if (names.some((n) => targets.includes(n))) score += 100;
    else if (names.some((n) => n.length >= 4 && targets.some((t) => t.length >= 4 && (n.includes(t) || t.includes(n))))) score += 40;
    if (score === 0) continue; // no title match -> never accept

    const released = c.release_date ? Date.parse(c.release_date) : NaN;
    if (!Number.isNaN(released) && released > now - 18 * MONTH && released < now + 6 * MONTH) score += 20;
    if (c.poster_path) score += 10;
    score += Math.min(Math.log10(1 + c.popularity), 3);
    if (!best || score > best.score) best = { c, score };
  }
  return best?.c ?? null;
}

type FetchFn = typeof fetch;

export class Tmdb {
  constructor(private key: string, private fetchFn: FetchFn = fetch, private retryDelayMs = 500) {
    if (!key) throw new Error("TMDB_API_KEY is empty");
  }

  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers: Record<string, string> = { accept: "application/json" };
    // v4 "API Read Access Token" is a JWT -> Bearer; v3 "API Key" goes in the query string.
    if (this.key.startsWith("eyJ")) headers.authorization = `Bearer ${this.key}`;
    else url.searchParams.set("api_key", this.key);
    // Retry transient failures (network errors, 429, 5xx) a few times with backoff.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, this.retryDelayMs * 2 ** (attempt - 1)));
      try {
        const res = await this.fetchFn(url, { headers });
        if (res.status === 429 || res.status >= 500) { lastErr = new Error(`TMDB ${path} -> HTTP ${res.status}`); continue; }
        if (!res.ok) throw new Error(`TMDB ${path} -> HTTP ${res.status}`);
        return (await res.json()) as T;
      } catch (e) {
        if (e instanceof Error && /^TMDB .* HTTP \d+$/.test(e.message)) throw e; // definitive HTTP error (401, 404 …)
        lastErr = e; // network-level failure: retry
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async searchMovie(query: string, language = "zh-TW"): Promise<TmdbCandidate[]> {
    const r = await this.get<{ results: TmdbCandidate[] }>("/search/movie", { query, language, include_adult: "false" });
    return r.results ?? [];
  }

  async imdbId(tmdbId: number): Promise<string | null> {
    const r = await this.get<{ imdb_id?: string | null }>(`/movie/${tmdbId}/external_ids`);
    return r.imdb_id || null;
  }

  /** Full details of one film (used for manual overrides). */
  async details(tmdbId: number, language = "zh-TW"): Promise<{ id: number; title: string; poster_path: string | null; imdb_id: string | null }> {
    return this.get(`/movie/${tmdbId}`, { language });
  }

  /** English title first (more reliable), then the Chinese one. */
  async match(q: MovieQuery): Promise<TmdbCandidate | null> {
    const queries = [q.titleEn, q.titleZh].filter((s): s is string => !!s && s.trim().length >= 2);
    for (const query of queries) {
      const hit = pickBest(await this.searchMovie(query), q);
      if (hit) return hit;
    }
    return null;
  }
}
