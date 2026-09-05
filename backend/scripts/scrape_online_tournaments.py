"""Scrape community-run ONLINE Pokemon Champions (Regulation M-B) tournaments
from play.limitlesstcg.com's public JSON API - no key required for this
level of access (confirmed against https://docs.limitlesstcg.com/developer.html),
no robots.txt exists on this host at all (checked: 404).

This is a completely different source from scrape_limitless_tournaments.py
(limitlessvgc.com, official in-person events only). Online tournaments here
are community-organized Swiss events (Discord servers, small leagues, etc.)
- there are roughly 50/week, so this only imports ones with at least
MIN_PLAYERS entrants to keep signal over noise, and only backfills the last
BACKFILL_DAYS on first run (older ones are simply never looked at again
after that window closes).

Two endpoints:
  GET /api/tournaments?game=VGC&format=M-B&page=N&limit=200
      -> [{"id","name","date","format","players","organizerId"}, ...],
      newest first, paginated.
  GET /api/tournaments/<id>/standings
      -> [{"name","country","decklist":[{"id","name","item","ability",
           "attacks":[...],"nature","tera"}...],"placing","player",
           "record":{"wins","losses","ties"},"drop"}, ...]
      `placing` is null for anyone who didn't make the final cut (Swiss-only
      finish) - only entries with a real placing are imported as results.
      No EVs here either - same gap as the in-person scraper.

Writes backend/data/limitless_online_tournaments.json, same shape as
scrape_limitless_tournaments.py's output (so both feed the same loader):
[{"external_id", "name", "date", "format", "player_count", "source_url",
  "results": [{"placement", "player", "record",
               "roster": [{"pokemon_name", "item", "ability", "nature",
                           "moves": [...]}]}]}]

Usage:
    backend/venv/bin/python backend/scripts/scrape_online_tournaments.py
"""
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

API_BASE = "https://play.limitlesstcg.com/api"
SITE_BASE = "https://play.limitlesstcg.com"
TARGET_FORMAT = "M-B"  # current Champions regulation only - see module docstring
MIN_PLAYERS = 32  # skip small community events to keep signal over noise
BACKFILL_DAYS = 90  # ~3 months
PAGE_LIMIT = 200
REQUEST_DELAY_SECONDS = 0.3  # lighter than the HTML scraper - this is a real JSON API

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "limitless_online_tournaments.json"


def fetch_json(url):
    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
    resp.raise_for_status()
    time.sleep(REQUEST_DELAY_SECONDS)
    return resp.json()


def list_tournaments(cutoff):
    """Every M-B online tournament with player_count >= MIN_PLAYERS, newer
    than `cutoff` (a timezone-aware datetime)."""
    found = []
    page = 1
    while True:
        batch = fetch_json(f"{API_BASE}/tournaments?game=VGC&format={TARGET_FORMAT}&page={page}&limit={PAGE_LIMIT}")
        if not batch:
            break
        stop = False
        for t in batch:
            date = datetime.fromisoformat(t["date"].replace("Z", "+00:00"))
            if date < cutoff:
                stop = True
                break
            if t.get("players", 0) >= MIN_PLAYERS:
                found.append({"external_id": t["id"], "name": t["name"], "date": date, "player_count": t["players"]})
        print(f"  page {page}: {len(batch)} tournaments, {len(found)} qualifying so far")
        if stop or len(batch) < PAGE_LIMIT:
            break
        page += 1
    return found


def parse_standings(standings):
    results = []
    for entry in standings:
        if entry.get("placing") is None:
            continue  # Swiss-only finish, no final ranking assigned
        roster = [
            {
                "pokemon_name": p["id"],
                "item": p.get("item"),
                "ability": p.get("ability"),
                "nature": p.get("nature"),
                "moves": p.get("attacks", []),
            }
            for p in entry.get("decklist", [])
        ]
        if not roster:
            continue
        record = entry.get("record") or {}
        record_str = f"{record.get('wins', 0)}-{record.get('losses', 0)}-{record.get('ties', 0)}"
        results.append({
            "placement": entry["placing"],
            "player": entry.get("player") or entry.get("name"),
            "record": record_str,
            "roster": roster,
        })
    results.sort(key=lambda r: r["placement"])
    return results


def main():
    cutoff = datetime.now(timezone.utc) - timedelta(days=BACKFILL_DAYS)
    print(f"Finding online M-B tournaments with {MIN_PLAYERS}+ players since {cutoff.date()}...")
    listing = list_tournaments(cutoff)
    print(f"Found {len(listing)} qualifying tournaments.")

    tournaments = []
    for i, entry in enumerate(listing, start=1):
        external_id = entry["external_id"]
        try:
            standings = fetch_json(f"{API_BASE}/tournaments/{external_id}/standings")
            results = parse_standings(standings)
            if not results:
                print(f"  [{i}/{len(listing)}] {entry['name']}: skipped (no placed results)")
                continue
            tournaments.append({
                "external_id": external_id,
                "name": entry["name"],
                "date": entry["date"].date().isoformat(),
                "format": "m-b",
                "player_count": entry["player_count"],
                "source_url": f"{SITE_BASE}/tournaments/{external_id}",
                "results": results,
            })
            print(f"  [{i}/{len(listing)}] {entry['name']}: {len(results)} results")
        except Exception as e:
            print(f"  [{i}/{len(listing)}] {entry['name']}: FAILED ({e})")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(tournaments, indent=2))
    print(f"Wrote {len(tournaments)} online tournaments to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
