# TaipeiMovieCollector

Compare showtimes across Vieshow cinemas in Taipei and New Taipei on one timeline. Personal use.
See [ARCHITECTURE.md](./ARCHITECTURE.md) for how it works and [plan.md](./plan.md) for the original plan.

```
backend/              Python API (FastAPI)
backend/collector/    Data collection and database schema (TypeScript)
frontend/             Web page (Angular)
docker-compose.yml    Database and production services
.env                  Configuration for everything (not committed)
```

## Requirements
- Node 22.22.3 or newer, Docker with Compose
- Python 3 with venv (`sudo apt install python3-venv`)
- Playwright Chromium for the scraper: `npx playwright install chromium`
  (Linux system libraries: `sudo npx playwright install-deps chromium`)

## First-time setup
```bash
cp .env.example .env            # set passwords and TMDB_API_KEY
docker compose up -d postgres pgadmin    # Postgres on 127.0.0.1:5432, pgAdmin on http://localhost:5050

cd backend/collector
npm install
npm run db:migrate              # create tables
npm run seed                    # add cinemas (safe to repeat)

cd ..                           # backend/
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

cd ../frontend
npm install
```

## Development
Use two terminals:

```bash
cd backend && source .venv/bin/activate && fastapi dev app/main.py   # http://localhost:8000/docs
```
```bash
cd frontend && npm start                                             # http://localhost:4200
```

| Task | Folder | Command |
|---|---|---|
| API tests | `backend/` | `.venv/bin/python -m pytest` |
| Frontend build | `frontend/` | `npm run build` |
| Collector tests / type check | `backend/collector/` | `npm test` / `npm run typecheck` |
| Sync all showtimes (about 25 minutes) | `backend/collector/` | `npm run sync:vieshow -- --all` |
| Add posters and TMDB ids | `backend/collector/` | `npm run enrich:tmdb` |
| New / apply database migration | `backend/collector/` | `npm run db:generate` / `npm run db:migrate` |
| Database shell | `backend/collector/` | `npm run db:psql` |
| Delete the database | project root | `docker compose down -v` |

## Scraping rules
Read public pages only, slowly (random 2–5 s between pages). Cinemas publish showtimes weekly, so sync weekly.
If blocked (403, 429, `Access Denied`, `/hold/`), stop and record it: no retries, no fingerprint spoofing, no IP rotation, no proxies.

## Self-hosting (production)

```bash
docker compose up -d --build web     # starts postgres, api and web; site on http://127.0.0.1:3000 (WEB_PORT)
```

- The scraper is **not** containerised: it needs a residential IP and local Chromium. Run it on the host.
- Weekly refresh (Vieshow publishes on Wednesday): `crontab -e` and add
  `0 22 * * 3 /path/to/TaipeiMovieCollector/backend/collector/scripts/ops/weekly-sync.sh`
  (logs in `backend/collector/.state/`). The machine and Docker must be running at that time.
- Public access without opening router ports: create a Cloudflare Tunnel (Zero Trust → Networks → Tunnels), point its public hostname at `http://web:3000`, put the token in `.env` as `CLOUDFLARE_TUNNEL_TOKEN`, then `docker compose --profile tunnel up -d`.
- The site has no authentication and is read-only. Postgres and pgAdmin stay bound to 127.0.0.1; never expose them.
