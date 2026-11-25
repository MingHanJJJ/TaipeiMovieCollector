#!/usr/bin/env bash
# Weekly refresh (Vieshow publishes on Wednesday). Run on the host, NOT in Docker:
# the scraper needs a real residential IP + local Chromium.
# crontab:  0 22 * * 3  /home/han-hs/TaipeiMovieCollector/backend/collector/scripts/ops/weekly-sync.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
mkdir -p .state
log=".state/sync-$(date +%F).log"
{
  echo "== $(date -Is) start"
  docker compose up -d postgres
  npm run sync:vieshow -- --all
  npm run enrich:tmdb
  echo "== $(date -Is) done"
} >>"$log" 2>&1
