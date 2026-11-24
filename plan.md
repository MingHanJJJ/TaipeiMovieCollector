# TaipeiMovieCollector — 實作計畫(v3:跨影院場次比對 UI)

> **v3 變更(2026-11-24)**
> - **重心**:把台北各電影院的場次放在一起,做出**好用的比對 UI**。
> - 已移除:座位熱區/好位子分數(座位頁被 Akamai 擋,見附錄 A)、座位完售檢查、熔斷器。
> - 場次更新頻率:**影城每週只更新一次場次**,同步改為每週(不再每日多次)。
> - 專案僅供個人自用。
> - **不做 Letterboxd 分數**(2026-11-24 決定):官方 API 需 Letterboxd 核發 `client_id/secret`、申請資格未確認,爬網頁違反其服務條款。評分只用 **IMDb + 爛番茄**(OMDb)。威秀 9 間台北/新北影城已完整同步(1,825 場次 / 66 部電影)。

## Context

把台北各電影院現在放映的場次整理成一個網站,讓人**一眼比對**:同一部片在哪些影城、幾點、什麼廳型(IMAX/4DX/數位、國/英語)有場;並附 IMDb 與爛番茄分數,可用時間段搜尋。

資料來源:先威秀(TP 與其餘 8 間台北/新北威秀)、大直美麗華,再視情況擴充其他影城。

## 技術決策

| 項目 | 選擇 |
|---|---|
| 全端 | Next.js(App Router)+ TypeScript + Tailwind |
| DB | PostgreSQL 17 + Drizzle ORM;本地 `docker compose`(Postgres + pgAdmin <http://localhost:5050>) |
| 爬蟲 | Node Playwright 獨立 worker(`scripts/`),`cheerio` 解析;不放在 Next request 內 |
| 評分 | TMDB(中文片名→IMDb ID)+ OMDb API(IMDb / Rotten Tomatoes) |
| 多影城 | provider adapter(`RawScreening` 統一格式),上層共用 |

**環境(已完成)**:Docker + Postgres + pgAdmin 運行中;Node 22;Next.js 16 骨架;Playwright Chromium;vitest / eslint。

## 同步策略(每週)

威秀公告:週五上映的電影,新場次於每週三 12:00–18:00 公布,開放週五到下週四的場次;週三/週四上映則於週一/週二晚上公布。因此:
- **每週三 18:30 後同步一次**為主;**週四中午補跑一次**撈漏。其餘時間不跑,需要時手動 `npm run sync:vieshow`。
- 完整同步成功才清除「已從官網消失」的未來場次(避免部分失敗誤刪)。
- 請求節奏維持 2–5 秒隨機間隔、單一 session;遇到封鎖(403/429/`Access Denied`/`/hold/`)**直接中止該次同步並記錄 `sync_runs.status = blocked`**,不重試、不換手法。(不再有跨次的熔斷器狀態檔。)

## 威秀場次資料來源(已驗證)

`https://www.vscinemas.com.tw/vsTicketingN/ticketing/ticket.aspx` 不需登入、純 GET,Playwright(+stealth,無頭)可讀:

| 階段 | URL | 取得 |
|---|---|---|
| 影城 | 下拉選單 `#theater`,值 `1\|TP` | 影城 id\|code |
| 電影清單 | `ticket.aspx?cinema=1\|TP` | 該館所有電影版本(`movie=HO00018172`,每個廳型/語言版本各一個 ID) |
| 場次 | `ticket.aspx?cinema=1\|TP&movie=HO…` | 片名(中/英)、分級、片長、每日日期、各場時間、場次 ID(`booking.aspx?cinemacode=1&txtSessionId=…`) |

一次 TP 完整同步約 47 次請求(約 3 分鐘)。每個影城各跑一次;9 間威秀約 400+ 次請求,每週一次。

## 資料模型(PostgreSQL,已建立)

- `cinemas`(id, provider, code, provider_cinema_id, name, region)— 已 seed 9 間威秀
- `movies`(id, title_zh, title_en, tmdb_id, imdb_id, runtime_min, rating_class, poster_url, imdb_rating, imdb_votes, rt_critics_pct, ratings_fetched_at)
- `screenings`(id, cinema_id, movie_id, provider_session_id, provider_movie_id, starts_at, ends_at, format, language, last_seen_at;UNIQUE(cinema_id, provider_session_id)、UNIQUE(cinema_id, movie_id, starts_at, format))
- `sync_runs`(id, provider, cinema_id, started_at, finished_at, status, screenings_upserted, error)
- 時間存 UTC、顯示用 `Asia/Taipei`。

## UI 設計(重心)

目標:**用最少的點擊回答「我想看 X,今天/這週末在哪、幾點、什麼版本最方便?」**

1. **首頁 = 電影比對牆**
   - 頂部篩選列(黏在頂端):日期(今天、明天…本週 7 天 chips)、時間段滑桿(例 18:00–22:00)、影城多選、廳型(IMAX/4DX/3D/數位)、語言(國/英/日)、片名搜尋。篩選存在 URL query,可分享/重新整理。
   - 每部電影一張卡:海報、片名、片長、分級、**IMDb / RT 徽章**、符合條件的場次數;卡片內以「影城 × 時間」小表格呈現各影城符合條件的場次(時間 chips,依廳型上色,點擊→官方訂票頁)。
2. **單片比對視圖(`/movies/[id]`)**
   - **時間軸矩陣**:列 = 影城(同影城不同廳型各一列),欄 = 小時(10:00→凌晨),場次畫成 `開演–散場` 色塊;**目前時間線**、使用者的時間段以背景高亮;一眼看出哪間最早、最晚、有無 IMAX。
   - 同一天切換、選擇多天並排(週末雙日)。
3. **影城視圖(`/cinemas/[code]`)與連看規劃**
   - 選 1–2 部電影,在同一條時間軸上排出,標出**不重疊且間隔 ≥ 20–30 分**的組合(沿用參考專案的連看概念)。
4. **細節**
   - 手機優先(chips 可橫向捲動、卡片單欄);深淺色;場次已過自動淡化;空狀態提示「放寬時間段」;資料新鮮度(「場次更新於 …,影城每週三更新」)。
   - 訂票連結導向官方(`booking.aspx?cinemacode=…&txtSessionId=…`;**此連結直接開啟是否可用需手動驗證**)。
5. 效能:列表與矩陣由單一 SQL(依日期範圍 + 時間段 + 影城 + 廳型)取回,伺服器元件渲染;互動篩選用 URL 驅動。

## 階段規劃

### Phase 0 — 威秀來源驗證 ✅ / 美麗華來源調查 ⏳
美麗華:官網網址、場次是 HTML 或 JSON、有無 WAF、有無場次 ID/片長。只調查場次,不碰訂票/座位。

### Phase 1 — Schema 與骨架 ✅
Drizzle schema + migrations(0000、0001)、`scripts/seed/cinemas.mts`、npm scripts、README。

### Phase 2 — 威秀場次爬蟲 ✅(TP)
`src/lib/vieshow/{parse-title,parse-movie-list,parse-sessions}.ts` + fixture 測試(27 個測試通過)、`scripts/providers/vieshow/sync.mts`。TP 實測 270 場次 / 40 部電影,重跑不重複。
- 待做:擴到其餘 8 間威秀(逐館執行;確認 MU / MUC 共用 id 21 不會重複)、加 `--all` 參數、週排程。
- 已知限制:凌晨場次若列在同一日期(00:xx)會被算成當天凌晨;分級只對應 `general`→普遍級,其餘保留原 class 名。

### Phase 3 — 評分整合
✅ **海報 / TMDB 完成(2026-11-24)**:`src/lib/tmdb.ts`(客戶端:v3 key 走 `api_key`、v4 token 走 Bearer;網路錯誤/429/5xx 自動重試;片名比對 `pickBest`——必須標題吻合才採用,寧缺勿錯)、`scripts/enrich/tmdb.mts`(`npm run enrich:tmdb`,寫入 `tmdb_id` / `imdb_id` / `poster_url`;`--retry` 重查未命中者)、`scripts/seed/tmdb-overrides.json`(人工對照,優先於自動比對;值為 TMDB id 或 `null`=不配對)、`src/components/Poster.tsx`(有圖顯示、無圖顯示首字佔位)。
- **實測結果**:69 部電影中 **61 部對到海報、57 部取得 IMDb ID**。人工修正 2 筆(華倫夫人的職業→NT Live 2025 版 1507563;同級生:十週年重映→372754)。未對到 8 部:6 部演唱會/直播場、「來自深淵:覺醒的神祕」(TMDB 查無)、1 部。
- 同一部片的不同片名(例如「樂園追放」/「樂園追放 心之共鳴」)對到同一個 TMDB id 時,UI 合併成一張卡;`movies.tmdb_id/imdb_id` 已改為非唯一索引(migration 0003)。
- 自動比對無法分辨「同名舊片」(曾把 NT Live 2025 誤配到 1972 年版本),請目視檢查海報,錯的加進 overrides。
- 頁尾已加 TMDB attribution;`.env` 的 key 已確認不在 git 內。
- 下一步(OMDb):用已取得的 `imdb_id` 查 IMDb / 爛番茄分數。

`enrich.ts`:TMDB `search/movie`(`zh-TW`,年份/片長輔助)→ `imdb_id` → OMDb `?i=ttXXXX&tomatoes=true`;N/A 容錯(顯示「—」,每週重試);存 DB 當快取;對不到的片 → `scripts/seed/movie-aliases.json`。需要 `TMDB_API_KEY`、`OMDB_API_KEY`。

### Phase 4 — 查詢層與 API
`src/lib/search.ts`:`date` / `from`–`to`(`Asia/Taipei` time-of-day,支援跨午夜)/ `cinema[]` / `format[]` / `language[]` / `q`,回傳「電影 → 影城 → 場次」分組結構與評分。`/api/search`、`/api/movies/[id]`。單元測試(含跨午夜、時區邊界)。

### Phase 5 — 前端(重心)
✅ **第一版完成(2026-11-24)**:首頁 `/`
- **時間軸矩陣**:每部電影一張卡,列 = 影城、欄 = 小時(共用同一條時間軸,依當天資料自動決定範圍,凌晨場次接在 24 時之後),場次畫成「開演–散場」色塊;同影城同時段的不同廳自動分 lane;廳型上色(數位/IMAX/4DX/直播/GC);今天顯示「現在」紅線、已開演場次淡化。
- **勾選影城**:篩選列的影城膠囊(可全選/清除),勾選狀態寫進網址(`?c=TP,QS`)並記在 localStorage,下次沒帶參數時自動還原;日期 chips(今天起)、片名搜尋(300ms debounce);全部由 URL 驅動、可分享。
- 實作:`src/lib/timeline.ts`(純函式 + 單測)、`src/lib/screenings.ts`(查詢)、`src/components/{FilterBar,MovieCard,TimelineMatrix}.tsx`、`src/app/page.tsx`(靜態外殼 + Suspense 串流,Cache Components 規範)。`scripts/dev/screenshot.mts` 可對執行中的 app 截圖並跑互動檢查。
- **特殊廳優先**:每個影城列內依廳型分層排列——最上層 IMAX / TITAN / 4DX / GC / MUCROWN,其次其他特別場(VR、直播、光感應援場、IV…),最下層一般數位/3D;TITAN、GC、MUCROWN 用同一種琥珀色(`formatTier` / `packLanesByTier`,含單測)。
- **影城列排序**:每部電影內,有 IMAX 的影城整列最先,其次有 TITAN / 4DX / GC / MUCROWN 的影城,再來有其他特別場的,最後才是只有一般場的;同級維持影城原順序(`formatRank`,含單測)。
- 已驗證:40 個測試、typecheck、lint、`next build`(Partial Prerender);瀏覽器自動化檢查勾選/清除/還原/搜尋/手機寬度無橫向捲動、無主控台錯誤。
- 場次連結導向威秀「該片場次頁」(`ticket.aspx?cinema=…&movie=…`,在那裡選時間);**尚未驗證**直接連到單一場次(`booking.aspx`)是否可用。
- 分級顯示取自威秀 CSS 徽章(普/護/輔/限/待);輔導級 12+/15+ 無法從來源區分。
- 待做:IMDb/RT 徽章(Phase 3)、單片詳情頁、影城視圖與連看規劃、時間段篩選(滑桿)、廳型/語言篩選、排序。
- **資料現況**:威秀目前只完整公布到 11/25(11/24 共 371 場、11/25 共 505 場,之後只有少數特別場);新一週場次於週三公布,**週三晚上需重新執行 `npm run sync:vieshow -- --all`**。

(以下為原規劃)
依上方 UI 設計:篩選列 → 電影比對牆 → 單片時間軸矩陣 → 影城視圖/連看規劃。元件:`FilterBar`、`MovieCard`、`SessionChip`、`TimelineMatrix`、`RatingBadges`。以假資料先把 UI 做出來,再接 API。

### Phase 6 — 排程
`node-cron` 或系統 cron:每週三 18:30、週四 12:00;`sync_runs` 顯示於頁尾資料新鮮度。

### Phase 7 — 更多影城
美麗華 adapter;再依需求擴充(例如其他台北連鎖/獨立影城,各自獨立 adapter,共用 schema)。

## 風險

| 風險 | 對策 |
|---|---|
| 威秀頁面改版 / 被封鎖 | parser 有 fixture 測試;解析失敗不覆蓋舊資料;封鎖就中止並記錄;每週低頻 |
| 同一部片跨影城名稱不同 | 以 TMDB ID 去重 + alias 表 |
| RT 分數缺漏 | OMDb N/A 容錯 + 重試 |
| 各影城資料來源不一 | provider adapter;單一影城失敗不影響其他 |
| 訂票連結不可直接開啟 | 先手動驗證;不行就改連到該片的場次頁 |
| ToS | 僅個人自用、不公開上線、導向官方訂票 |

## 驗證方式

1. `docker compose ps` healthy;`npm run db:migrate`;`npm test`、`npm run typecheck`、`npm run lint` 通過。
2. `npm run sync:vieshow -- --cinema TP`;抽查 3–5 場時間/片長與官網一致;重跑無重複。
3. 評分抽查 5 部電影;RT 為 N/A 時 UI 顯示「—」。
4. `npm run dev` 以瀏覽器驗證:時間段篩選只留下該時段場次;單片矩陣的色塊位置與時間相符;手機寬度可用;分享含篩選條件的網址能還原畫面。

---

## 附錄 A — 威秀座位頁(已放棄)

2026-11-24 實測:`sales.vscinemas.com.tw` 座位頁受 Akamai Bot Manager 保護;無頭 Playwright 被 403 / 導向 `/hold/`,有頭 Chromium 同樣被導向 `/hold/`。判斷為自動化瀏覽器指紋被判為機器人,決定不繞過,**放棄座位熱區、好位子分數與座位完售檢查**。使用者自己的瀏覽器可開,其另存的 HTML 顯示座位頁是伺服器端渲染表格(格式可解析),若日後有合規取得方式可恢復。
已擱置、不再使用的程式:`src/lib/vieshow/seat-parser.ts`、`src/lib/seat-scoring.ts`、`tests/seat-*.test.ts`、`tests/fixtures/vieshow/session-seats-TP-1888630.html`、`scripts/spike/*`。熔斷器與座位抓取器已刪除。
