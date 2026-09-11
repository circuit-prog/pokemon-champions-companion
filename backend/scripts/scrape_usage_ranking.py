"""Scrape the top-N most-used Pokemon for a Pokemon Champions regulation from
limitlessvgc.com, which publishes real usage rankings (rank/name/usage%) per
format. Used to decide *which* Pokemon to import full data for, so the
roster reflects what people actually play instead of an arbitrary dex-order
cutoff.

Writes backend/data/usage_ranking.json: [{"rank", "name", "display_name",
"usage_percent"}, ...] in rank order. `name` is already in PokeAPI's
lowercase-hyphenated form (matches the <img alt="..."> the site uses).

FORMAT_PRIORITY tries the newest regulation first and falls back to the
previous one if it comes back empty - a brand-new regulation (like M-C,
live since 2026-09-08/09) doesn't have enough games played yet for the
site to publish usage stats for it, so falling back avoids leaving the
site's "current meta" pages empty for the weeks it takes for that data to
show up. Update this list's front entry each time a new regulation ships.

Usage:
    backend/venv/bin/python backend/scripts/scrape_usage_ranking.py
"""
import json
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://limitlessvgc.com"
FORMAT_PRIORITY = ["m-c", "m-b"]
TOP_N = 600
ROWS_PER_PAGE = 25
REQUEST_DELAY_SECONDS = 0.5  # be polite to the source site

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "usage_ranking.json"
# Which regulation the ranking data above actually came from - written so
# scrape_usage_detail.py (which needs the SAME regulation's move/item/ability
# breakdowns) doesn't have to guess or duplicate the fallback logic.
FORMAT_OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "usage_format.json"


def fetch(url):
    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
    resp.raise_for_status()
    time.sleep(REQUEST_DELAY_SECONDS)
    return resp.text


def parse_rank_table(html):
    soup = BeautifulSoup(html, "lxml")
    entries = []
    for row in soup.select("table tr"):
        cells = row.find_all("td")
        if len(cells) != 5:
            continue
        rank_text = cells[0].get_text(strip=True)
        img = cells[1].find("img")
        name_link = cells[2].find("a")
        pct_text = cells[4].get_text(strip=True)
        if not (rank_text.isdigit() and img and img.get("alt") and name_link):
            continue
        entries.append({
            "rank": int(rank_text),
            "name": img["alt"],
            "display_name": name_link.get_text(strip=True),
            "usage_percent": float(pct_text.rstrip("%")) if pct_text.rstrip("%").replace(".", "", 1).isdigit() else None,
        })
    return entries


def scrape_format(fmt):
    ranked = []
    page = 1
    while len(ranked) < TOP_N:
        html = fetch(f"{BASE}/pokemon?format={fmt}&page={page}")
        entries = parse_rank_table(html)
        if not entries:
            break
        ranked.extend(entries)
        print(f"  [{fmt}] page {page}: {len(entries)} entries (total so far: {len(ranked)})")
        page += 1
    return ranked[:TOP_N]


def main():
    for fmt in FORMAT_PRIORITY:
        ranked = scrape_format(fmt)
        if ranked:
            print(f"Using {fmt} usage data ({len(ranked)} Pokemon).")
            break
        print(f"No usage data published yet for {fmt}, trying the next regulation back...")
    else:
        print("No usage data found for any regulation in FORMAT_PRIORITY - leaving the existing file alone.")
        return

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(ranked, indent=2))
    FORMAT_OUTPUT_PATH.write_text(json.dumps({"format": fmt}))
    print(f"Wrote {len(ranked)} ranked Pokemon to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
