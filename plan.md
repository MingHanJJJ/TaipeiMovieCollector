# TaipeiMovieCollector — 實作計畫(v2:只做場次)

> **v2 範圍變更(2026-11-24)**:放棄「座位熱區 / 好位子分數 / 影廳座位規劃」,專心做**場次 + 評分 + 搜尋**。
> 原因:座位頁在 `sales.vscinemas.com.tw`,受 Akamai Bot Manager 保護,無頭與有頭瀏覽器都進不去(詳見附錄 A)。專案**僅供個人自用**。

## Context

做一個全端網站(Next.js + PostgreSQL),顯示**台北電影院現在放映的場次**。第一階段:**台北信義威秀(`TP`)**,並納入**大直美麗華**;資料模型與爬蟲保留 `cinema` 維度,之後再擴到其他台北威秀(QS、TX、MU、BQ、GM、HU)。

三個核心功能:
1. **場次**:各影城、各電影的場次(日期、開演/散場時間、廳型/語言、片長、是否完售)。
2. **電影評分**:每部電影顯示 IMDb 與爛番茄分數。
3. **搜尋**:可依特定時間段(及日期、片名、廳型、評分)搜尋場次。

已移除(不做):座位表、座位權重/好位子分數、影廳座位圖、座位剩餘同步。相關程式碼已擱置,見附錄 B。

## 技術決策

| 項目 | 選擇 |
|---|---|
| 全端 | **Next.js(App Router)+ TypeScript** |
| DB | **PostgreSQL 17** + Drizzle ORM;本地用 `docker compose`(Postgres + pgAdmin <http://localhost:5050>) |
| 爬蟲 | Node 版 Playwright 獨立 worker(`scripts/`),`cheerio` 解析;**不放在 Next request 內** |
| 評分 | **TMDB**(中文片名→IMDb ID)+ **OMDb API**(IMDb / Rotten Tomatoes);官方 RT API 年費 $60k 起,不採用 |
| 多影城 | **provider adapter**(威秀、美麗華),上層 DB/評分/搜尋/前端共用 |
| 運行方式 | 個人自用、本機運行;低頻、有快取、有熔斷器 |

**環境現況(已完成)**:Docker + Postgres 17 + pgAdmin 已啟動(`docker compose up -d`);Node 22.23.5(nvm);Next.js 16 骨架與依賴已安裝;Playwright Chromium 與系統函式庫已安裝。

### 多影城架構:Provider adapter
```ts
interface CinemaProvider {
  id: 'vieshow' | 'miramar'
  listCinemas(): Promise<CinemaInfo[]>
  fetchScreenings(cinemaCode: string, range: DateRange): Promise<RawScreening[]>
}
interface RawScreening {
  providerSessionId?: string          // 威秀有 (txtSessionId)
  movieTitleZh: string; movieTitleEn?: string
  format: string; language?: string; ratingClass?: string   // 例:IMAX 3D / 4DX / 數位;英/國
  startsAt: Date; runtimeMin?: number; soldOut?: boolean
}
```
- 目錄:`scripts/providers/{vieshow,miramar}/`;`cinemas.provider` 欄位區分。
- 同一部片跨影城/廳型的名稱不同 → 以 **TMDB ID** 在 `movies` 去重(Phase 3)。
- **美麗華(大直,代碼暫定 `MR`)**:有全台唯一可完整呈現 1.43:1 的 IMAX(含 70mm);熱門片開賣時官網曾當機 → 低頻、避開開賣尖峰。**官網網址與場次端點尚未調查**(Phase 0)。

## 資料來源:威秀場次(已驗證)

訂票系統 `https://www.vscinemas.com.tw/vsTicketingN/ticketing/ticket.aspx` **不需登入、純 GET**,Playwright(+stealth,無頭)可通過 Akamai。ID 穩定:

| 階段 | URL | 取得 |
|---|---|---|
| 影城 | 下拉選單 `#theater`,option 值 `1\|TP` | 全部威秀影城的 id\|code |
| 電影清單 | `ticket.aspx?cinema=1\|TP` | 該館所有電影版本(`a[href*="movie="]`,`movie=HO00018172`;每個廳型/語言版本各一個 ID) |
| 場次 | `ticket.aspx?cinema=1\|TP&movie=HO00018172` | 片名(中/英)、分級、**片長**(`1 時 49 分`)、每日日期、各場時間、`booking.aspx?cinemacode=1&txtSessionId=1888562` → **場次 ID**、**完售標示**(紅底時間) |

- 優於參考專案(`GetShowTimes` 只有時間):多了**場次 ID、片長、完售狀態**。
- 一次 TP 完整同步 ≈ 1(電影清單)+ ~45(每個版本一頁)≈ 46 次請求,以 2–5 秒隨機間隔、每日 2–3 次即可;單頁解析用 fixture 單測。
- `/ShowTimes/` + `POST GetShowTimes` 可當**輕量備援**(一次請求拿到全部電影×日期×時間,但無 ID)。
- **座位頁不碰**(`sales.vscinemas.com.tw` 被 Akamai 擋)。

## 專案結構

```
TaipeiMovieCollector/
├── plan.md  docker-compose.yml  docker/pgadmin-servers.json  .env(.example,已 gitignore)
├── package.json  drizzle.config.ts
├── src/
│   ├── app/{page.tsx, movies/[id]/page.tsx, api/{cinemas,movies,screenings,search}/route.ts}
│   ├── db/{schema.ts, client.ts, migrations/}
│   ├── lib/
│   │   ├── search.ts                       # 時間段/條件查詢
│   │   ├── ratings/{tmdb.ts, omdb.ts, enrich.ts}
│   │   └── vieshow/circuit-breaker.ts      # 已完成,通用熔斷器(擴用於場次請求)
│   └── components/{ScreeningCard, SearchBar, RatingBadges}.tsx
├── scripts/
│   ├── providers/{vieshow,miramar}/{browser.ts, parse-*.ts, sync.ts}
│   └── seed/{cinemas.ts, movie-aliases.json}
└── tests/{fixtures/, *.test.ts}            # vitest
```

## 資料模型(PostgreSQL)

- `cinemas`(id, provider, code `TP`, provider_cinema_id `1`, name, region)
- `movies`(id, title_zh, title_en, tmdb_id, imdb_id, runtime_min, rating_class, poster_url, imdb_rating, imdb_votes, rt_critics_pct, ratings_fetched_at)
- `screenings`(id, cinema_id, movie_id, provider_session_id nullable, provider_movie_id, starts_at timestamptz, ends_at, format, language, sold_out bool, last_seen_at, UNIQUE(cinema_id, provider_session_id) 或 (cinema_id, movie_id, starts_at, format))
- `sync_runs`(id, provider, cinema_id, started_at, finished_at, status, screenings_upserted, error)
- 索引:`screenings(starts_at)`、`screenings(movie_id, starts_at)`;時間存 UTC、顯示用 `Asia/Taipei`;`last_seen_at` 用於標記已下架場次。

## 階段規劃

### Phase 0 — 美麗華調查(威秀已完成)
只調查場次來源:官網網址、場次是 HTML 或 JSON、有無 WAF、是否有場次 ID/片長/完售。**不碰訂票與座位流程**。

### Phase 1 — Schema 與骨架
✅ **完成(2026-11-24)**:`src/db/schema.ts`(cinemas / movies / screenings / sync_runs)、`src/db/client.ts`、`drizzle.config.ts`、migration `0000`(已套用到本地 Postgres)、`scripts/seed/cinemas.mts`(9 間台北/新北威秀,可重複執行)、npm scripts(`test` `typecheck` `db:generate` `db:migrate` `db:psql` `db:studio` `seed`)、vitest/eslint 設定、README。`typecheck`、`lint`、17 個測試、`next build` 皆通過。

### Phase 2 — 威秀場次爬蟲(TP)
`parse-movie-list.ts`、`parse-sessions.ts`(cheerio,用抓下來的 HTML fixture 單測:片名 regex `(3D 數位 英)片名 (普遍級)`、片長、場次 ID、完售)、`sync.ts`(upsert、`ends_at = starts_at + 片長 + 廣告約 15 分`、標記消失的場次)。請求前一律 `CircuitBreaker.assertClosed()`;任何 403/429/`Access Denied`/`/hold/` → 24 小時熔斷。

### Phase 3 — 評分整合
`enrich.ts`:TMDB `search/movie`(`zh-TW`,年份/片長輔助)→ `imdb_id` → OMDb `?i=ttXXXX&tomatoes=true`。**N/A 容錯**(顯示「—」,每週重試);結果存 DB 當快取(OMDb 免費 1,000 次/日);對不到的片 → `movie-aliases.json`。

### Phase 4 — 搜尋 API
`GET /api/search?date=&from=HH:mm&to=HH:mm&cinema=&movie=&format=&minImdb=&minRt=&sort=time|rating`
- 時間段以 `Asia/Taipei` time-of-day 比對,**支援跨午夜**(22:00–02:00)。
- 回傳場次 + 電影評分 + 完售標示。

### Phase 5 — 前端
首頁:日期、時間段滑桿、片名搜尋、影城/廳型/評分篩選;場次卡片(海報、IMDb/RT 徽章、時間、廳型、完售);電影頁:各影城場次與評分。手機優先;每張場次卡片附「前往威秀訂票」連結(導向官方)。

### Phase 6 — 排程與維運
`node-cron`:場次每日 2–3 次、評分每週;失敗退避、寫 `sync_runs`;遇封鎖停止並顯示於頁面狀態列。

### Phase 7 — 美麗華 adapter
依 Phase 0 結果實作並接上同一套 sync/搜尋。

### Phase 8 — 擴充
其他台北威秀(只需 cinema 設定);之後再評估國賓、秀泰等。

## 風險

| 風險 | 對策 |
|---|---|
| Akamai 封鎖 | 低頻(單頁間隔 2–5 秒、每日 2–3 次)、快取、熔斷器;不偽造指紋/不換 IP/不用代理 |
| ToS / 法務 | 僅個人自用、不公開上線、不轉售;資料導回官方訂票 |
| 威秀頁面改版 | parser 有 fixture 測試;解析失敗不覆蓋舊資料、記錄 `sync_runs` |
| RT 分數缺漏 | OMDb N/A 容錯 + 週期重試 + 手動 alias |
| 中文片名對不到 TMDB | 年份+片長輔助、alias 表、人工覆核清單 |
| 美麗華來源未知 | Phase 0 先調查;adapter 失敗不影響威秀 |

## 驗證方式(End-to-End)

1. `docker compose ps` → Postgres healthy、pgAdmin 可開;`npm run db:migrate` 成功。
2. `npm test`:parser(fixture)、search(含跨午夜)、circuit-breaker。
3. `npm run sync:vieshow -- --cinema TP` → `screenings` 有未來場次;抽查 3~5 場(時間、片長、完售)與官網一致。
4. 評分抽查 5 部電影與 IMDb / RT 官網一致(RT 為 N/A 時 UI 顯示「—」)。
5. `npm run dev` → 搜尋「18:00–22:00」只出現該時段場次;卡片顯示評分與完售;再跑一次 sync 不產生重複場次。

---

## 附錄 A — Phase 0 威秀 Spike 結論(2026-11-24,僅讀取)

- `www.vscinemas.com.tw` 的場次頁與 `vsTicketingN/ticket.aspx`:Playwright(無頭 + stealth)可通過 Akamai(HTTP 200),不需登入。
- **座位頁** `sales.vscinemas.com.tw/VoucherTicketing/SessionSeats.aspx?CinemaCode=1&txtSessionId=…`:
  - 無頭直接 GET → 302 到 `/hold/`(「分流期間,官網部分功能暫停」);從電影頁點擊 → **403 Access Denied**(Akamai 邊緣錯誤格式 `Reference #18.…` / `errors.edgesuite.net`);有頭 Chromium(無 stealth)→ 200 但導向 `/hold/`。
  - 判斷:自動化瀏覽器指紋(含 Client Hints 的 `HeadlessChrome` 品牌、CDP 痕跡、零行為事件、冷啟動 session)被 Bot Manager 判為機器人。**不再重試、不升級手法。**
- 使用者自己的瀏覽器可開;其另存的 HTML 顯示座位頁是伺服器端渲染的純表格(`#GridViewSessionSeats`:可選 `label-info`、已售 `label-danger`、走道 `Null.png`、輪椅位 `wheelchair_available.png`;標頭含片名、日期時間、影城、`第11廳`)。第 11 廳:13 排 × 23 欄、254 座。格式可解析,但**無法合規地自動取得**,因此放棄座位功能。
- 熔斷器於 2026-11-24 觸發,冷卻至 2026-11-25 12:31(台北時間);狀態檔 `.state/vieshow-circuit.json`。

## 附錄 B — 已擱置的座位相關程式碼

以下已寫好並通過測試,但因範圍變更**不再使用**(保留以便日後若取得合規資料來源時恢復):
`src/lib/vieshow/seat-parser.ts`、`src/lib/seat-scoring.ts`、`scripts/vieshow/seat-fetcher.ts`、`scripts/spike/*`、`tests/fixtures/vieshow/session-seats-TP-1888630.html`、`tests/seat-*.test.ts`。
`src/lib/vieshow/circuit-breaker.ts` 仍會沿用(場次請求同樣受熔斷器保護)。
