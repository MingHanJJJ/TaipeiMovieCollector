import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMovieList } from "../src/lib/vieshow/parse-movie-list";
import { parseSessionsPage, RATING_BY_CLASS, taipeiToDate } from "../src/lib/vieshow/parse-sessions";
import { parseVersionTitle } from "../src/lib/vieshow/parse-title";

const fx = (n: string) => readFileSync(`tests/fixtures/vieshow/${n}`, "utf8");

describe("parseVersionTitle", () => {
  it.each([
    ["(數位 英)歡迎光臨魔法秘境", { title: "歡迎光臨魔法秘境", format: "數位", language: "英" }],
    ["(數位 國)歡迎光臨魔法秘境", { title: "歡迎光臨魔法秘境", format: "數位", language: "國" }],
    ["(4DX 3D 英)歡迎光臨魔法秘境", { title: "歡迎光臨魔法秘境", format: "4DX 3D", language: "英" }],
    ["(數位)沙丘：第三部", { title: "沙丘：第三部", format: "數位", language: undefined }],
    ["(IV 4DX 3D)復仇者聯盟：末日崛起", { title: "復仇者聯盟：末日崛起", format: "IV 4DX 3D", language: undefined }],
    ["(LIVE)M-舞台『刀劍亂舞』陽傳 現場直播", { title: "M-舞台『刀劍亂舞』陽傳 現場直播", format: "LIVE", language: undefined }],
    ["沒有括號的片名", { title: "沒有括號的片名", format: "", language: undefined }],
  ])("%s", (raw, want) => {
    const got = parseVersionTitle(raw);
    expect({ title: got.title, format: got.format, language: got.language }).toEqual(want);
  });
});

describe("parseMovieList (TP fixture)", () => {
  const list = parseMovieList(fx("ticket-movie-list-TP.html"));
  it("finds every version with a unique id", () => {
    expect(list).toHaveLength(46);
    expect(new Set(list.map((m) => m.providerMovieId)).size).toBe(46);
  });
  it("splits format / language / title", () => {
    const hexed = list.filter((m) => m.title === "歡迎光臨魔法秘境");
    expect(hexed.map((m) => [m.format, m.language, m.providerMovieId]).sort()).toEqual([
      ["4DX 3D", "英", "HO00018178"],
      ["數位", "國", "HO00018173"],
      ["數位", "英", "HO00018172"],
    ]);
  });
  it("throws on a page without movies", () => {
    expect(() => parseMovieList("<html><title>Access Denied</title></html>")).toThrow(/no movies/);
  });
});

describe("parseSessionsPage (TP / HO00018172 fixture)", () => {
  const p = parseSessionsPage(fx("ticket-movie-TP-HO00018172.html"));
  it("reads the header", () => {
    expect(p).toMatchObject({ title: "歡迎光臨魔法秘境", format: "數位", language: "英", runtimeMin: 109, ratingClass: "普遍級" });
    expect(p.titleEn).toBe("DISNEYS HEXED"); // "(DIG E)" format prefix stripped
  });
  it("reads all sessions with ids", () => {
    expect(p.sessions).toHaveLength(30);
    expect(new Set(p.sessions.map((s) => s.sessionId)).size).toBe(30);
    expect(p.sessions[0]).toMatchObject({ sessionId: "1888562", date: "2026-11-26", time: "10:35" });
    expect(p.sessions[0].startsAt.toISOString()).toBe("2026-11-26T02:35:00.000Z"); // 10:35 +08:00
  });
  it("throws on a blocked page", () => {
    expect(() => parseSessionsPage("<html><title>Access Denied</title></html>")).toThrow(/header not found/);
  });
});

describe("taipeiToDate", () => {
  it("rolls hours >= 24 into the next day", () => {
    expect(taipeiToDate("2026-11-26", "24:30").toISOString()).toBe("2026-11-26T16:30:00.000Z");
    expect(taipeiToDate("2026-11-26", "25:10").toISOString()).toBe("2026-11-26T17:10:00.000Z");
  });
});

describe("RATING_BY_CLASS", () => {
  it("maps every badge class used by the site", () => {
    expect(Object.keys(RATING_BY_CLASS).sort()).toEqual(["adult", "bigchild", "childview", "general", "needCheck", "pg", "teenager"]);
    expect(RATING_BY_CLASS.childview).toBe("保護級");
  });
});
