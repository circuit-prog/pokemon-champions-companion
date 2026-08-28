"""Scrape Pokemon Champions Reg M-B usage data from Pikalytics' dedicated
AI-facing API (plain Markdown, not scraped HTML).

This exists because limitlessvgc.com (our other data source) has zero
tracked data for Regulation M-B - the regulation actually current in
Pokemon Champions right now (as of writing), which includes Mega Pokemon
(Charizard-Mega-Y, Raichu-Mega-Y, Staraptor-Mega, etc.) that limitlessvgc's
M-A data doesn't cover at all.

Pikalytics publishes /ai/pokedex/<format>[/<pokemon>] specifically for
automated consumption - documented in their /llms-full.txt and explicitly
allowed for AI crawlers in robots.txt. This is not HTML-scraping; it's
their own published Markdown API.

Writes backend/data/pikalytics_usage.json:
{
  "format": "battledataregmbs3",
  "pokemon": {
    "<name-slug>": {
      "rank": int, "win_rate": float, "record": str,
      "moves": [{"name","percent"}], "items": [...], "abilities": [...],
      "teammates": [{"name","percent"}]  # percent may be null if Pikalytics didn't publish it
    }
  }
}

Usage:
    backend/venv/bin/python backend/scripts/scrape_pikalytics.py
"""
import json
import re
import time
from pathlib import Path

import requests

BASE = "https://www.pikalytics.com/ai/pokedex/battledataregmbs3"
TOP_N = 50  # Pikalytics' index page publishes the top 50 by usage
REQUEST_DELAY_SECONDS = 0.5

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "pikalytics_usage.json"


def fetch(url):
    resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
    resp.raise_for_status()
    time.sleep(REQUEST_DELAY_SECONDS)
    return resp.text


def to_slug(pikalytics_name):
    """'Charizard-Mega-Y' -> 'charizard-mega-y' (matches our PokeAPI-derived slugs)."""
    return pikalytics_name.lower()


def parse_index(text):
    """Parse the '## Best 50 Pokemon by Usage' table: rank, name, win rate, record."""
    entries = []
    in_table = False
    for line in text.splitlines():
        if line.startswith("## Best") and "Usage" in line:
            in_table = True
            continue
        if in_table:
            if line.startswith("## "):
                break
            m = re.match(r"\|\s*(\d+)\s*\|\s*\*\*([^*]+)\*\*\s*\|[^|]*\|\s*([\d.]+)%\s*\|\s*([\d\-]+)\s*\|", line)
            if m:
                entries.append({
                    "rank": int(m.group(1)),
                    "name": m.group(2).strip(),
                    "win_rate": float(m.group(3)),
                    "record": m.group(4),
                })
    return entries[:TOP_N]


def parse_percent_list(text, header):
    """Parse a '## <header>\n- **Name**: NN.N%' style section into [{"name","percent"}]."""
    idx = text.find(f"## {header}")
    if idx == -1:
        return []
    section = text[idx:]
    next_header = section.find("\n## ", 1)
    if next_header != -1:
        section = section[:next_header]
    results = []
    for m in re.finditer(r"^- \*\*([^*]+)\*\*:\s*([\d.]+|undefined)%?$", section, re.MULTILINE):
        name, pct = m.group(1).strip(), m.group(2)
        results.append({"name": name, "percent": None if pct == "undefined" else float(pct)})
    return results


def parse_detail(text):
    moves = parse_percent_list(text, "Common Moves")
    items = parse_percent_list(text, "Common Items")
    abilities = parse_percent_list(text, "Common Abilities")
    teammates = parse_percent_list(text, "Common Teammates")
    return {"moves": moves, "items": items, "abilities": abilities, "teammates": teammates}


def main():
    print("Fetching Reg M-B index...")
    index_text = fetch(BASE)
    entries = parse_index(index_text)
    print(f"Found {len(entries)} ranked Pokemon.")

    result = {"format": "battledataregmbs3", "pokemon": {}}
    for i, entry in enumerate(entries, start=1):
        slug = to_slug(entry["name"])
        try:
            detail_text = fetch(f"{BASE}/{entry['name']}")
            detail = parse_detail(detail_text)
        except Exception as e:
            print(f"  [{i}/{len(entries)}] {entry['name']}: FAILED ({e})")
            detail = {"moves": [], "items": [], "abilities": [], "teammates": []}

        result["pokemon"][slug] = {
            "rank": entry["rank"],
            "win_rate": entry["win_rate"],
            "record": entry["record"],
            **detail,
        }
        print(f"  [{i}/{len(entries)}] {entry['name']}: "
              f"{len(detail['moves'])} moves, {len(detail['items'])} items, "
              f"{len(detail['abilities'])} abilities, {len(detail['teammates'])} teammates")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, indent=2))
    print(f"Wrote data for {len(result['pokemon'])} Pokemon to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
