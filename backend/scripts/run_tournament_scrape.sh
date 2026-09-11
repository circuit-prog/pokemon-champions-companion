#!/bin/bash
# Weekly tournament scrape: pulls new Regulation M-A/M-B/M-C results from
# limitlessvgc.com (official in-person events) and play.limitlesstcg.com
# (community online events, 32+ players), then loads any new ones into the
# local database. Safe to rerun any time - load_limitless_tournaments.py
# skips tournaments it's already loaded (matched by each source site's own
# tournament id).
#
# This does NOT refresh usage_ranking.json/usage_detail.json (the "most
# used Pokemon" data behind Start Here and the Pokedex) - those are a
# separate, manually-run pair of scripts (scrape_usage_ranking.py then
# scrape_usage_detail.py) since they change much more slowly than
# tournament results do.
#
# Invoked by com.pcc.tournamentscrape.plist (see that file for how to
# install it as a scheduled launchd job). Can also be run by hand:
#   backend/scripts/run_tournament_scrape.sh
set -euo pipefail

cd "$(dirname "$0")/.."  # backend/

echo "=== $(date) ==="
venv/bin/python scripts/scrape_limitless_tournaments.py
venv/bin/python scripts/scrape_online_tournaments.py
venv/bin/python scripts/load_limitless_tournaments.py
echo
