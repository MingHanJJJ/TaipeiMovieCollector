# TaipeiMovieCollector — 實作計畫

> 核准後第一步:把本文件複製為 `/home/han-hs/TaipeiMovieCollector/plan.md`(Plan mode 下只能寫此檔)。

## Context

要做一個全端網站(前端 + 後端 + DB),顯示**台北電影院目前放映的場次與座位表**。第一階段先做**台北信義威秀(代碼 `TP`)**,並**同步納入大直美麗華影城**(見下方「多影城架構」);資料模型與爬蟲保留 `cinema` 維度,之後再擴到其他台北威秀(QS、TX、MU、BQ、GM、HU)。

### 多影城架構:Provider adapter(威秀 + 美麗華)
兩家官網、API、座位格式都不同,因此爬蟲以 **adapter 介面**隔離,上層(DB、評分、搜尋、前端)完全共用:

```ts
interface CinemaProvider {
  id: 'vieshow' | 'miramar'
  listCinemas(): Promise<CinemaInfo[]>
  fetchShowtimes(cinemaCode: string, range: DateRange): Promise<RawScreening[]>
  fetchSeatMap?(screening: RawScreening): Promise<SeatState>   // 依 Spike 結果實作
}
```
- 目錄:`scripts/providers/{vieshow,miramar}/`;`cinemas` 表增加 `provider` 欄位。
- **美麗華(大直,台北唯一一間,影城代碼暫定 `MR`)** 已知資訊:有**全台唯一可完整呈現 1.43:1 的 IMAX(含 70mm 膠捲)**,熱門片開賣時官網/App 曾當機(→ 爬取更需低頻、避開開賣尖峰);2018 年經營權變動後官網為重新設立。**官網網址、場次與選位端點尚未驗證**,列入 Phase 0 Spike,需另行調查後才能確定是否有 WAF、場次是否為 HTML 或 JSON。
- 片名比對:兩家影城同一部片會有不同譯名/格式標記,以 TMDB ID 做 `movies` 去重(Phase 5),同片跨影城可併列比較。
- 美麗華影廳座位圖同樣需手動建立(IMAX 廳為重點,推薦座位研究價值最高)。

三個核心功能:
1. **好位子分數**:每個影廳有專屬的座位權重,計算「該場次剩餘好位置的分數」。
2. **電影評分**:每部電影顯示 IMDb 與爛番茄分數。
3. **搜尋**:可依特定時間段搜尋電影/場次。

### 參考專案分析(`/home/han-hs/vscinemas-skill`,PttCodingMan/vscinemas-skill)
- 威秀有 **Akamai WAF**,必須用 Playwright(+stealth)開真實瀏覽器,再在頁面內 `fetch`。
- 已知端點(同源 fetch):
  - `GET /api/GetLstDicCinema` → 影城列表,`strValue = "{id}|{code}"`
  - `POST /ShowTimes/ShowTimes/GetShowTimes`,body `CinemaCode=TP` → **HTML**,需用 BeautifulSoup 解析(`div.col-xs-12` > `strong.MovieName.LangTW`、`.RealShowDate`、`.SessionTimeInfo`)
  - 片名格式 `(3D 數位 英)片名 (普遍級)` → 用 regex 拆出 廳型/語言、片名、分級
  - 片長:`/film/detail.aspx?id={id}` 內以 regex 抓 `片長 N 時 M 分`
- **缺口**:只有「電影 × 日期 × 時間」,**沒有影廳編號、場次 ID、座位圖、已售狀態**。座位資料屬於訂票流程,需 Spike 驗證。
- 可沿用:影城代碼表、HTML 解析邏輯、片名 regex、TTL 快取概念(改存 DB)。

## 技術決策(已與使用者確認)

| 項目 | 選擇 |
|---|---|
| 全端 | **Next.js(App Router)+ TypeScript** |
| DB | **PostgreSQL** + Drizzle ORM(輕量、SQL 友善、遷移簡單) |
| 爬蟲 | **Node 版 Playwright**,獨立 worker(`scripts/`),不放在 Next request 內執行;解析用 `cheerio` |
| 評分來源 | **TMDB**(中文片名→IMDb ID)+ **OMDb API**(IMDb / Rotten Tomatoes);官方 RT API 年費 $60k 起,不採用 |
| 座位資料 | 先做 **Spike**;另外**手動建立各廳靜態座位圖與權重**(需上網研究各廳推薦座位) |
| 範圍 | 威秀 TP + 大直美麗華(provider adapter 架構),其餘台北威秀後續擴充 |
| 本地 DB | `docker compose`:Postgres 17 + pgAdmin 4(<http://localhost:5050>) |

**環境前置**(目前只有 Python 3.14,沒有 Node / npm / Docker / psql):
- **Docker**:裝 Docker Desktop(Windows,開啟 WSL2 integration)或在 WSL 內 `apt install docker.io docker-compose-v2`(需 sudo)。
- **Postgres + pgAdmin 用 `docker compose` 啟動**(已建立 `docker-compose.yml`、`docker/pgadmin-servers.json`、`.env.example`):
  - `cp .env.example .env && docker compose up -d`
  - Postgres:`localhost:5432`(只綁 127.0.0.1),DB `taipei_movies`,user `tmc`
  - pgAdmin:<http://localhost:5050>,帳密見 `.env`;已用 `servers.json` 預先註冊本地 Postgres(連線密碼首次手動輸入)
  - 資料存在 named volume `pgdata` / `pgadmin_data`;重置:`docker compose down -v`
- Node 22 LTS(nvm);`npx playwright install chromium`。

## 專案結構

```
TaipeiMovieCollector/
├── plan.md
├── docker-compose.yml            # (選用) postgres
├── package.json  drizzle.config.ts  .env.example   # TMDB_API_KEY, OMDB_API_KEY, DATABASE_URL
├── src/
│   ├── app/                      # Next.js
│   │   ├── page.tsx              # 首頁:今日場次 + 搜尋
│   │   ├── movies/[id]/page.tsx  # 電影詳情 + 各影城場次
│   │   ├── screenings/[id]/page.tsx  # 座位表(熱度圖 + 剩餘)
│   │   └── api/{cinemas,movies,screenings,search}/route.ts
│   ├── db/{schema.ts, client.ts, migrations/}
│   ├── lib/
│   │   ├── seat-scoring.ts       # 權重生成 + 場次分數計算(純函式,可單測)
│   │   ├── search.ts             # 時間段/條件查詢組裝
│   │   └── ratings/{tmdb.ts, omdb.ts, enrich.ts}
│   └── components/{SeatMap, ScreeningCard, SearchBar, RatingBadges}.tsx
├── scripts/                      # 獨立 worker(tsx 執行)
│   ├── vieshow/{browser.ts, parse-showtimes.ts, sync-showtimes.ts, sync-seats.ts}
│   ├── spike/seatmap-spike.ts    # Phase 0
│   └── seed/{cinemas.ts, halls/TP-*.json}   # 各廳座位圖 + 權重設定
└── tests/                        # vitest:scoring、parser(含 HTML fixture)、search
```

## 資料模型(PostgreSQL)

- `cinemas`(id, code `TP`, vieshow_id, name, region)
- `halls`(id, cinema_id, name/廳號, format `IMAX|4DX|GC|數位…`, rows, screen_side, layout_version, `layout jsonb`)
- `hall_seats`(hall_id, row_label, col_no, x, y, kind `normal|couple|wheelchair|aisle-adjacent|blocked`, **weight** `0–10`, weight_source `auto|manual`)
- `movies`(id, title_zh, title_en, tmdb_id, imdb_id, runtime_min, rating_class, poster_url, imdb_rating, imdb_votes, rt_critics_pct, ratings_fetched_at)
- `screenings`(id, cinema_id, hall_id nullable→Spike 後補, movie_id, vieshow_session_id nullable, starts_at timestamptz, ends_at, format, language, UNIQUE(cinema_id, movie_id, starts_at, format))
- `screening_seat_snapshots`(screening_id, fetched_at, `taken bitset/jsonb`, total_seats, available_seats, **good_score**, **total_score**, **best_pair_score**)
- 索引:`screenings(starts_at)`、`screenings(movie_id, starts_at)`、`snapshots(screening_id, fetched_at desc)`;所有時間存 UTC、顯示用 `Asia/Taipei`。

## 好位子分數設計

**單座權重 `w(seat) ∈ [0,10]`**
1. **自動基線**:以影廳幾何算 — 水平:離中軸越近越高;垂直:甜蜜帶約在**後 1/3~1/2 排**(IMAX 偏後中、一般廳約 2/3 深度),用高斯衰減:`w = 10 · exp(-(dx²/2σx² + dy²/2σy²))`,σ 依廳型設定。
2. **手動覆寫**:依網路研究(PTT、Dcard、影迷部落格、IMAX 官方建議)在 `halls/TP-*.json` 對特定座位/區域設 `override`(例:前兩排 ×0.3、走道旁 ×0.9、情侶座另計、輪椅位 0)。
3. 權重來源以 `weight_source` 記錄,可重算(改 JSON → 重新 seed)。

**場次分數**(由剩餘座位即時計算)
- `good_score = Σ w(s)  for s ∈ available ∧ w(s) ≥ 閾值(預設 7)`
- `total_score = Σ w(s)  for s ∈ available`;正規化:`good_ratio = good_score / hall_max_good_score`(0–100%)
- `best_pair_score`:相鄰兩連座的最大權重和(情侶/朋友看片實用);可擴為 N 連座
- 顯示:場次卡片上「好位子 82%」徽章 + 座位熱度圖(紅=好位,灰=已售)。
- `seat-scoring.ts` 為純函式,vitest 覆蓋邊界(全空、全滿、單座孤立、閾值變動)。

## 階段規劃

### Phase 0 — Spike:座位資料可行性(**先做,決定後續**)
目標:用 Playwright 走一次線上訂票流程**只讀到選位頁、不下單、不送出個資**,以 `page.on('response')` 記錄 XHR/HTML,輸出到 scratchpad 分析。
- **兩家都要做**:威秀(TP)與美麗華(大直)各自跑一次 Spike,**各自**判定 A/B/C 等級(兩家可能不同)。美麗華需先找出官方訂票網址與場次/選位端點。
- 確認:① 場次是否有 session ID / 影廳編號 ② 選位頁是否回傳座位矩陣與已售/可選狀態 ③ 是否需登入或驗證碼 ④ 請求頻率限制 / WAF 行為。
- **成功分級與後備**:
  - **A**(拿到座位矩陣+已售狀態)→ 完整實作 `sync-seats.ts`。
  - **B**(只拿得到版面或剩餘座位數)→ 版面自建、剩餘用數量按權重分佈估算,UI 標示「估計」。
  - **C**(完全拿不到)→ 靜態座位圖 + 模擬佔位資料,評分/UI 完整可跑,接口預留。
- 同時評估 ToS/robots 風險:低頻率(每場次最多每 15–30 分鐘一次)、只抓公開頁、單機單 IP、不繞過登入。

### Phase 1 — 專案骨架
安裝 Docker + Node → `docker compose up -d`(Postgres + pgAdmin)→ `create-next-app` → Drizzle schema + migration(`cinemas.provider` 欄位)→ vitest/eslint → README(啟動步驟)。

### Phase 2 — 場次爬蟲(威秀 TP + 美麗華)
先實作 `CinemaProvider` 介面;威秀 adapter 把 `scraper.py` 邏輯移植成 TypeScript,美麗華 adapter 依 Spike 結果實作。威秀部分:`browser.ts`(launch + stealth + 開 ShowTimes 頁取得 cookie)、`parse-showtimes.ts`(cheerio + 片名 regex,**用抓下來的 HTML fixture 寫單測**)、`sync-showtimes.ts`(upsert cinemas/movies/screenings,計算 `ends_at = starts_at + runtime + 廣告 15 分`)。同步未來 7~14 天、cron 每 2 小時。

### Phase 3 — 影廳座位圖與權重(手動 + 研究)
- 蒐集 TP 與美麗華各廳(含 IMAX、4DX、GC、數位廳)排數/每排座位數/走道/情侶座/輪椅位 → `scripts/seed/halls/TP-*.json`。
- 以網路研究建立每廳推薦區域 override,**每個廳的依據(來源連結)寫在 JSON 註解欄位**,方便日後檢討。
- `seed` 腳本寫入 `halls` / `hall_seats`;`seat-scoring.ts` 先用靜態圖 + 假佔位資料驗證。
- (若 Spike 為 A,版面可由實測資料對照校正。)

### Phase 4 — 座位剩餘同步(依 Spike 結果)
`sync-seats.ts`:對「未來 N 小時內開演」的場次輪詢(越近開演越頻繁,例如 >24h:每 3h;<3h:每 15 分),寫 `screening_seat_snapshots`;並綁定 `screenings.hall_id`。

### Phase 5 — 評分整合
`enrich.ts`:對新電影 → TMDB `search/movie`(`language=zh-TW`,年份/片長輔助比對)取 `imdb_id` → OMDb `?i=ttXXXX&tomatoes=true` 取 IMDb rating/votes 與 RT。**N/A 容錯**(顯示「—」,每週重試);結果存 `movies` 作快取,避免超過 OMDb 免費額度 1,000 次/日。比對不到的片留人工對照表 `scripts/seed/movie-aliases.json`。

### Phase 6 — 搜尋 API
`GET /api/search?date=&from=HH:mm&to=HH:mm&cinema=&movie=&format=&minImdb=&minRt=&minGoodScore=&sort=time|rating|goodScore`
- 時間段:`starts_at AT TIME ZONE 'Asia/Taipei'` 的 time-of-day 落在 [from,to],支援跨日(如 22:00–02:00)。
- 回傳場次 + 電影評分 + 最新 snapshot 的 good_score。

### Phase 7 — 前端
- 首頁:日期選擇、時間段滑桿(例 18:00–22:00)、片名搜尋、廳型/評分/好位子篩選;場次卡片(電影海報、IMDb/RT 徽章、時間、廳型、好位子%)。
- 場次頁:`SeatMap`(SVG)顯示熱度、已售、螢幕方向、推薦座位高亮;資料更新時間。
- 電影頁:各影城場次、評分。響應式(手機優先)。

### Phase 8 — 排程與維運
`node-cron` 或系統 cron 跑 worker;爬蟲失敗重試/退避、記錄 `sync_runs` 表(成功/失敗/筆數);WAF 被擋時降頻並告警。

### Phase 9 — 擴充
加入其他台北威秀(僅需新增 hall JSON + cinema code);再評估國賓、秀泰等(各自獨立 adapter,共用 schema)。

## 風險

| 風險 | 對策 |
|---|---|
| 座位資料取不到 | Phase 0 分級後備 A/B/C(威秀、美麗華各自判定) |
| 美麗華官網/端點未知、熱門片開賣時不穩 | Spike 先調查;低頻、避開開賣尖峰;adapter 失敗不影響威秀資料 |
| Akamai WAF 封鎖 | 真實 Chromium + stealth、低頻、快取;不繞過登入 |
| ToS / 法務 | 只抓公開資訊、低頻、不轉售;網站顯示資料來源並導向官方訂票連結 |
| RT 分數缺漏 | OMDb N/A 容錯 + 週期重試 + 手動 alias |
| 中文片名對不到 TMDB | 年份+片長輔助、alias 表、人工覆核清單 |
| 各廳座位圖研究耗時 | 先 TP 5~6 廳,自動基線先上線,逐廳補 override |

## 驗證方式(End-to-End)

1. `npm run db:migrate && npm run seed` → DB 有 TP 與各廳座位。
2. `npm run sync:showtimes -- --cinema TP` → `screenings` 有未來場次(與威秀官網比對 3~5 場時間一致)。
3. Spike 腳本輸出分析報告,記錄 A/B/C 結論於 plan.md。
4. `npm test`:parser(HTML fixture)、`seat-scoring`(邊界案例)、`search`(跨日時間段)。
5. `npm run dev` → 瀏覽器操作:搜尋「18:00–22:00」只出現該時段場次;場次卡片顯示 IMDb/RT 與好位子%;座位頁熱度圖與權重相符;手動標記數個座位為已售,分數隨之下降。
6. 評分抽查:挑 5 部電影,對照 IMDb / RT 官網數字一致(RT 為 N/A 時 UI 顯示「—」不報錯)。
