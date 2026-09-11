"""Scrape community-run ONLINE Pokemon Champions tournaments from
play.limitlesstcg.com's public JSON API - no key required for this level of
access (confirmed against https://docs.limitlesstcg.com/developer.html), no
robots.txt exists on this host at all (checked: 404).

This is a completely different source from scrape_limitless_tournaments.py
(limitlessvgc.com, official in-person events only). Online tournaments here
are community-organized Swiss events (Discord servers, small leagues, etc.)
- there are roughly 50/week, so this only imports ones with at least
MIN_PLAYERS entrants to keep signal over noise, and only backfills the last
BACKFILL_DAYS on first run (older ones are simply never looked at again
after that window closes).

The site's own `format` field is NOT reliable for telling regulations
apart: most M-C-era tournaments are tagged "CUSTOM" rather than "M-C", and
some are even mislabeled "M-B" despite the organizer naming the event
"Reg M-C" (confirmed 2026-09-11 - e.g. "London Corviknights VGC Weekly Tour
12! (Reg M-C)" carries format="M-B"). So this scrapes every API `format`
value organizers have been seen using for Champions events (TARGET_API_FORMATS)
and then determines the *actual* regulation itself from the tournament name
via REGULATION_NAME_RE - skipping any tournament whose name doesn't clearly
say which regulation it's running.

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
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import requests

API_BASE = "https://play.limitlesstcg.com/api"
SITE_BASE = "https://play.limitlesstcg.com"
# API `format` values worth paging through - see module docstring for why
# this can't just be the current regulation's own name.
TARGET_API_FORMATS = ["M-A", "M-B", "M-C", "CUSTOM"]
REGULATION_NAME_RE = re.compile(r"\bm-([abc])\b", re.IGNORECASE)
MIN_PLAYERS = 32  # skip small community events to keep signal over noise
BACKFILL_DAYS = 90  # ~3 months
PAGE_LIMIT = 200
REQUEST_DELAY_SECONDS = 0.5  # lighter than the HTML scraper - this is a real JSON API

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "limitless_online_tournaments.json"


def detect_regulation(name: str) -> Optional[str]:
    """The tournament's actual regulation, read off its name (e.g. "Reg M-C
    Qualifier" -> "m-c") - the API's own `format` field can't be trusted,
    see module docstring. None if the name doesn't say."""
    match = REGULATION_NAME_RE.search(name)
    return f"m-{match.group(1).lower()}" if match else None


MAX_RETRIES = 4


def fetch_json(url):
    """GET with a retry/backoff on 429 - now that list_tournaments() queries
    four separate API `format` values instead of one, request volume is
    ~4x what it used to be and the API starts throttling partway through a
    run (confirmed live 2026-09-11: ~40 of 133 standings fetches failed
    with 429 before this existed)."""
    for attempt in range(MAX_RETRIES):
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
        if resp.status_code == 429:
            wait = REQUEST_DELAY_SECONDS * (3 ** (attempt + 1))
            time.sleep(wait)
            continue
        resp.raise_for_status()
        time.sleep(REQUEST_DELAY_SECONDS)
        return resp.json()
    resp.raise_for_status()
    return resp.json()


def list_tournaments(cutoff):
    """Every online tournament, across every API format worth checking, with
    player_count >= MIN_PLAYERS, newer than `cutoff` (a timezone-aware
    datetime), and whose name clearly states a Champions regulation. Dedupes
    across the multiple API `format` queries by external id."""
    found = {}
    for api_format in TARGET_API_FORMATS:
        for entry in _list_tournaments_for_format(api_format, cutoff):
            found[entry["external_id"]] = entry
    return list(found.values())


def _list_tournaments_for_format(api_format, cutoff):
    found = []
    page = 1
    while True:
        batch = fetch_json(f"{API_BASE}/tournaments?game=VGC&format={api_format}&page={page}&limit={PAGE_LIMIT}")
        if not batch:
            break
        stop = False
        for t in batch:
            date = datetime.fromisoformat(t["date"].replace("Z", "+00:00"))
            if date < cutoff:
                stop = True
                break
            regulation = detect_regulation(t["name"])
            if regulation and t.get("players", 0) >= MIN_PLAYERS:
                found.append({
                    "external_id": t["id"],
                    "name": t["name"],
                    "date": date,
                    "player_count": t["players"],
                    "format": regulation,
                })
        print(f"  [{api_format}] page {page}: {len(batch)} tournaments, {len(found)} qualifying so far")
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
    print(f"Finding online Champions tournaments with {MIN_PLAYERS}+ players since {cutoff.date()}...")
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
                "format": entry["format"],
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
