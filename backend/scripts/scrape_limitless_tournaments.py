"""Scrape official Pokemon Champions (Regulation M-B) tournament results from
limitlessvgc.com: which events happened, who placed where, and their team
(species only - see the note below on why sets aren't included).

Only scrapes limitlessvgc.com, whose robots.txt allows crawling everything
(`Disallow:` with no paths). Full per-Pokemon sets (item/ability/nature/EVs/
moves) live on RK9.gg's roster pages instead, and RK9.gg's robots.txt
explicitly disallows /roster/, /pairings/, /decklist/public/, and the
teamlist paths - exactly where that data lives - so this deliberately never
touches RK9.gg. Species-only rosters are still enough for "most brought";
add real sets by hand afterwards through the Tournaments admin form if you
want a specific result fully filled in.

Each tournament's own page (limitlessvgc.com/tournaments/<id>) already has
everything needed in one request: date, player count, format, and a
standings table with rank/player/country/roster - no need to page through
the table (tournaments are small enough that it's never paginated) or visit
a separate standings/roster page.

Writes backend/data/limitless_tournaments.json:
[{"external_id", "name", "date", "player_count", "source_url",
  "results": [{"placement", "player", "roster": ["<pokemon-slug>", ...]}]}]

Usage:
    backend/venv/bin/python backend/scripts/scrape_limitless_tournaments.py
"""
import json
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://limitlessvgc.com"
TARGET_FORMAT = "m-b"  # the only Champions regulation this app tracks
TOP_N_RESULTS = 32
MAX_LISTING_PAGES = 20  # generous ceiling; the listing stops early once exhausted
REQUEST_DELAY_SECONDS = 0.5  # be polite to the source site

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "limitless_tournaments.json"


def fetch(url):
    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
    resp.raise_for_status()
    time.sleep(REQUEST_DELAY_SECONDS)
    return resp.text


def find_mb_tournaments():
    """Walk the tournament listing, collecting {external_id, name} for every
    Regulation M-B event. The listing has no server-side format filter (the
    dropdown is client-side JS), so this filters each row's own
    data-format attribute instead."""
    found = []
    for page in range(1, MAX_LISTING_PAGES + 1):
        html = fetch(f"{BASE}/tournaments?page={page}")
        soup = BeautifulSoup(html, "lxml")
        rows = soup.select("table.completed-tournaments tr[data-format]")
        if not rows:
            break
        for row in rows:
            if row.get("data-format") != TARGET_FORMAT:
                continue
            link = row.select_one("td a[href^='/tournaments/']")
            if not link:
                continue
            external_id = link["href"].rsplit("/", 1)[-1]
            found.append({"external_id": external_id, "name": link.get_text(strip=True)})
        print(f"  listing page {page}: {len(rows)} rows, {len(found)} M-B tournaments so far")
    return found


def parse_tournament(html, external_id):
    soup = BeautifulSoup(html, "lxml")

    format_link = soup.select_one("a[href*='format=m-b']")
    if not format_link:
        return None  # not actually M-B (listing/detail can disagree in edge cases) - skip

    infobox = soup.select_one(".infobox-line")
    info_text = infobox.get_text(" ", strip=True) if infobox else ""
    date_match = re.search(r"(\d{1,2})(?:st|nd|rd|th)\s+(\w+)\s+(\d{4})", info_text)
    players_match = re.search(r"([\d,]+)\s+Players", info_text)

    date_iso = None
    if date_match:
        try:
            from datetime import datetime
            date_iso = datetime.strptime(
                f"{date_match.group(1)} {date_match.group(2)} {date_match.group(3)}", "%d %B %Y"
            ).date().isoformat()
        except ValueError:
            date_iso = None

    player_count = int(players_match.group(1).replace(",", "")) if players_match else None

    name_el = soup.select_one(".infobox-heading")
    name = name_el.get_text(strip=True) if name_el else f"Tournament {external_id}"

    results = []
    for row in soup.select("table.data-table tr[data-rank]"):
        rank = row.get("data-rank")
        player = row.get("data-name")
        roster = [img["alt"] for img in row.select(".vgc-team img.pokemon[alt]")]
        if not rank or not roster:
            continue
        results.append({"placement": int(rank), "player": player, "roster": roster})
        if len(results) >= TOP_N_RESULTS:
            break

    return {
        "external_id": external_id,
        "name": name,
        "date": date_iso,
        "player_count": player_count,
        "source_url": f"{BASE}/tournaments/{external_id}",
        "results": results,
    }


def main():
    print("Finding Regulation M-B tournaments...")
    listing = find_mb_tournaments()
    print(f"Found {len(listing)} M-B tournaments.")

    tournaments = []
    for i, entry in enumerate(listing, start=1):
        external_id = entry["external_id"]
        try:
            html = fetch(f"{BASE}/tournaments/{external_id}")
            parsed = parse_tournament(html, external_id)
            if not parsed:
                print(f"  [{i}/{len(listing)}] {entry['name']}: skipped (not M-B on detail page)")
                continue
            tournaments.append(parsed)
            print(f"  [{i}/{len(listing)}] {parsed['name']}: {len(parsed['results'])} results")
        except Exception as e:
            print(f"  [{i}/{len(listing)}] {entry['name']}: FAILED ({e})")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(tournaments, indent=2))
    print(f"Wrote {len(tournaments)} tournaments to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
