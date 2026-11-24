# TaipeiMovieCollector

台北電影院場次 + IMDb / 爛番茄評分 + 時間段搜尋(個人自用)。先做威秀 TP,之後加美麗華。
計畫與進度見 [plan.md](./plan.md)。

## 需求
- Node 22(nvm)、Docker(含 compose)
- Playwright Chromium:`npx playwright install chromium`(Linux 需系統函式庫:`sudo npx playwright install-deps chromium`)

## 啟動
```bash
cp .env.example .env            # 設定帳密與 TMDB_API_KEY / OMDB_API_KEY
docker compose up -d            # Postgres 17 (127.0.0.1:5432) + pgAdmin (http://localhost:5050)
npm install
npm run db:migrate              # 建立資料表
npm run seed                    # 寫入影城資料(可重複執行)
npm run dev                     # http://localhost:3000
```

## 常用指令
| 指令 | 說明 |
|---|---|
| `npm test` | vitest |
| `npm run typecheck` / `npm run lint` | 型別檢查 / ESLint |
| `npm run db:generate` | 依 `src/db/schema.ts` 產生 migration |
| `npm run db:migrate` | 套用 migration |
| `npm run db:psql` | 進入 Postgres 的 psql |
| `npm run db:studio` | Drizzle Studio |
| `docker compose down -v` | 停止並**清空**資料庫 |

## 爬蟲守則
只讀公開頁面、低頻、有快取;所有威秀請求都經過熔斷器(任一次 403/429/`Access Denied`/`/hold/` → 停止 24 小時),不偽造指紋、不換 IP、不用代理。狀態檔在 `.state/`。
