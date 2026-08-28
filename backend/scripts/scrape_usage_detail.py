"""For each Pokemon in usage_ranking.json (produced by scrape_usage_ranking.py),
scrape its most-used moves/items/abilities from limitlessvgc.com's per-Pokemon
usage page.

Note: as of writing, limitlessvgc.com does not publish EV spread data for
Pokemon Champions detail pages (checked: only Moves/Items/Abilities usage
tables exist, no Spreads/EVs section) - only move/item/ability usage %.

Writes backend/data/usage_detail.json: {pokemon_name: {"moves": [...],
"items": [...], "abilities": [...]}}, each list of {"name", "percent"}.

Usage:
    backend/venv/bin/python backend/scripts/scrape_usage_detail.py
"""
import json
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://limitlessvgc.com"
FORMAT = "m-a"
REQUEST_DELAY_SECONDS = 0.5

RANKING_PATH = Path(__file__).resolve().parent.parent / "data" / "usage_ranking.json"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "usage_detail.json"


def fetch(url):
    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
    resp.raise_for_status()
    time.sleep(REQUEST_DELAY_SECONDS)
    return resp.text


def parse_named_subtable(soup, label):
    """Find the <table> whose header cell text matches `label` (Moves/Items/Abilities)
    and return its rows as [{"name", "percent"}], sorted by usage already.
    """
    header = soup.find(string=lambda s: s and s.strip() == label)
    if not header:
        return []
    table = header.find_parent("table")
    if not table:
        return []
    results = []
    for row in table.select("tbody tr"):
        cells = row.find_all("td")
        if len(cells) < 3:
            continue
        # Moves/Abilities: [rank, name, pct]. Items: [rank, icon, name, pct] in some layouts.
        name = cells[-2].get_text(strip=True)
        pct_text = cells[-1].get_text(strip=True).rstrip("%")
        if not name or not pct_text.replace(".", "", 1).isdigit():
            continue
        results.append({"name": name, "percent": float(pct_text)})
    return results


def main():
    ranking = json.loads(RANKING_PATH.read_text())
    detail = {}
    for i, entry in enumerate(ranking, start=1):
        name = entry["name"]
        try:
            html = fetch(f"{BASE}/pokemon/{name}?format={FORMAT}")
            soup = BeautifulSoup(html, "lxml")
            detail[name] = {
                "moves": parse_named_subtable(soup, "Moves"),
                "items": parse_named_subtable(soup, "Items"),
                "abilities": parse_named_subtable(soup, "Abilities"),
            }
            print(f"  [{i}/{len(ranking)}] {name}: "
                  f"{len(detail[name]['moves'])} moves, {len(detail[name]['items'])} items, "
                  f"{len(detail[name]['abilities'])} abilities")
        except Exception as e:
            print(f"  [{i}/{len(ranking)}] {name}: FAILED ({e})")
            detail[name] = {"moves": [], "items": [], "abilities": []}

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(detail, indent=2))
    print(f"Wrote usage detail for {len(detail)} Pokemon to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
