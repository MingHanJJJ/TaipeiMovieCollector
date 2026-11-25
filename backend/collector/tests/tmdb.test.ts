import { describe, expect, it, vi } from "vitest";
import { normalizeTitle, pickBest, posterUrl, Tmdb, type TmdbCandidate } from "../src/lib/tmdb";

const c = (o: Partial<TmdbCandidate> & { id: number }): TmdbCandidate => ({
  title: "", original_title: "", poster_path: "/p.jpg", popularity: 10, release_date: "2026-12-01", ...o,
});
const now = new Date("2026-11-24T00:00:00Z");

describe("normalizeTitle", () => {
  it("ignores case, spaces and punctuation", () => {
    expect(normalizeTitle("DUNE: Part Three")).toBe(normalizeTitle("dune part three"));
    expect(normalizeTitle("沙丘：第三部")).toBe("沙丘第三部");
  });
});

describe("pickBest", () => {
  it("matches on the English title", () => {
    const hit = pickBest(
      [c({ id: 1, title: "Dune", original_title: "Dune", release_date: "2021-10-01" }), c({ id: 2, title: "沙丘：第三部", original_title: "Dune: Part Three" })],
      { titleZh: "沙丘：第三部", titleEn: "DUNE PART THREE", now },
    );
    expect(hit?.id).toBe(2);
  });
  it("prefers the recent release among equal title matches (remakes)", () => {
    const hit = pickBest(
      [c({ id: 1, title: "Godzilla Minus Zero", release_date: "1998-01-01", popularity: 50 }), c({ id: 2, title: "Godzilla Minus Zero", release_date: "2026-11-01", popularity: 5 })],
      { titleZh: "哥吉拉-0.0", titleEn: "GODZILLA MINUS ZERO", now },
    );
    expect(hit?.id).toBe(2);
  });
  it("never accepts a result without a title match", () => {
    expect(pickBest([c({ id: 1, title: "Something Else", original_title: "Something Else", popularity: 999 })], { titleZh: "沙丘：第三部", titleEn: "DUNE PART THREE", now })).toBeNull();
  });
  it("returns null for no candidates", () => {
    expect(pickBest([], { titleZh: "片", now })).toBeNull();
  });
});

describe("Tmdb client", () => {
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

  it("uses api_key for v3 keys and Bearer for v4 tokens", async () => {
    const f = vi.fn(async () => json({ results: [] })) as unknown as typeof fetch;
    await new Tmdb("abc123", f).searchMovie("x");
    const [u1] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [URL, RequestInit];
    expect(u1.searchParams.get("api_key")).toBe("abc123");
    expect(u1.searchParams.get("language")).toBe("zh-TW");

    const g = vi.fn(async () => json({ results: [] })) as unknown as typeof fetch;
    await new Tmdb("eyJtoken", g).searchMovie("x");
    const [u2, init] = (g as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [URL, RequestInit];
    expect(u2.searchParams.get("api_key")).toBeNull();
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer eyJtoken");
  });

  it("match(): tries the English title, falls back to Chinese, and reads imdb id", async () => {
    const calls: string[] = [];
    const f = (async (url: URL) => {
      calls.push(url.searchParams.get("query") ?? url.pathname);
      if (url.pathname.endsWith("/search/movie")) {
        return json({ results: url.searchParams.get("query") === "沙丘：第三部" ? [c({ id: 7, title: "沙丘：第三部", original_title: "Dune: Part Three" })] : [] });
      }
      return json({ imdb_id: "tt1160419" });
    }) as unknown as typeof fetch;
    const t = new Tmdb("k", f);
    const hit = await t.match({ titleZh: "沙丘：第三部", titleEn: "SOMETHING ELSE", now });
    expect(hit?.id).toBe(7);
    expect(calls).toEqual(["SOMETHING ELSE", "沙丘：第三部"]);
    expect(await t.imdbId(7)).toBe("tt1160419");
  });

  it("throws on HTTP errors and on an empty key", async () => {
    const bad = (async () => ({ ok: false, status: 401 }) as Response) as unknown as typeof fetch;
    await expect(new Tmdb("k", bad).searchMovie("x")).rejects.toThrow(/401/);
    expect(() => new Tmdb("")).toThrow(/empty/);
  });

  it("retries network errors and 5xx, but not definitive HTTP errors", async () => {
    let n = 0;
    const flaky = (async () => {
      n++;
      if (n === 1) throw new TypeError("fetch failed");
      if (n === 2) return { ok: false, status: 503 } as Response;
      return json({ results: [{ id: 1 }] });
    }) as unknown as typeof fetch;
    expect((await new Tmdb("k", flaky, 1).searchMovie("x")).length).toBe(1);
    expect(n).toBe(3);

    let m = 0;
    const notFound = (async () => { m++; return { ok: false, status: 404 } as Response; }) as unknown as typeof fetch;
    await expect(new Tmdb("k", notFound, 1).searchMovie("x")).rejects.toThrow(/404/);
    expect(m).toBe(1);

    const down = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    await expect(new Tmdb("k", down, 1).searchMovie("x")).rejects.toThrow(/fetch failed/);
  });

  it("builds image urls", () => {
    expect(posterUrl("/a.jpg")).toBe("https://image.tmdb.org/t/p/w342/a.jpg");
  });
});
