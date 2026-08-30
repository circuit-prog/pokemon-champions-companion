"""Pull Pokemon Champions Reg M-B usage data from Smogon's published stats.

Why this exists alongside the Pikalytics scraper:

Pikalytics' AI API publishes exactly the top 50 Pokemon for this format, and
its Usage % column reads "N/A" throughout - so we had 50 Pokemon, no usage
percentages, and no EV spreads at all. Smogon publishes the same regulation
(gen9championsvgc2026regmb) as flat text files covering ~310 Pokemon with real
usage percentages, and its "moveset" files include the one thing we most
needed and could not get anywhere else: real EV spreads with natures.

The spreads confirm the Champions EV system exactly - "Adamant:32/32/0/0/2/0"
is HP/Atk/Def/SpA/SpD/Spe, never above 32 in a stat, summing to 66.

Smogon publishes these files for public use at smogon.com/stats. We keep
Pikalytics for team cores and top tournament teams, which Smogon doesn't have.

Usage:
    backend/venv/bin/python backend/scripts/scrape_smogon.py
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BASE = "https://www.smogon.com/stats"
MONTH = "2026-07"
FORMAT = "gen9championsvgc2026regmb"

# Smogon splits each format by minimum player rating. 1760 is high-level
# ladder - what strong players actually run, which is what we want when
# telling someone "this is the best set". 1500 covers a broader field.
RATING = 1760

# "Other" is Smogon's catch-all bucket for the long tail, not a real
# ability/item/move, so it never belongs in our data.
SKIP_ENTRY = "Other"

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "smogon_usage.json"

STAT_ORDER = ["hp", "atk", "def", "spa", "spd", "spe"]


def fetch(url: str) -> str:
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.text


def parse_usage(text: str) -> dict:
    """The usage table: rank, name and the real usage percentage."""
    entries = {}
    for line in text.splitlines():
        # | 1    | Kingambit          | 36.79345% | 825864 | 23.400% | ...
        match = re.match(r"^\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([\d.]+)%", line)
        if not match:
            continue
        rank, name, usage_percent = match.groups()
        entries[name] = {"rank": int(rank), "usage_percent": round(float(usage_percent), 2)}
    return entries


def _parse_percent_lines(lines) -> list:
    """Rows like 'Defiant 99.168%' -> [{"name": "Defiant", "percent": 99.168}]."""
    out = []
    for line in lines:
        match = re.match(r"^(.*?)\s+([\d.]+)%$", line)
        if not match:
            continue
        name, percent = match.groups()
        name = name.strip()
        if name == SKIP_ENTRY:
            continue
        out.append({"name": name, "percent": round(float(percent), 2)})
    return out


def _parse_spreads(lines) -> list:
    """Rows like 'Adamant:32/32/0/0/2/0 14.640%'.

    The six numbers are HP/Atk/Def/SpA/SpD/Spe in Champions' 66-point,
    32-per-stat budget. Anything that doesn't fit that shape is skipped
    rather than guessed at.
    """
    out = []
    for line in lines:
        match = re.match(r"^([A-Za-z]+):([\d/]+)\s+([\d.]+)%$", line.strip())
        if not match:
            continue
        nature, ev_text, percent = match.groups()
        parts = ev_text.split("/")
        if len(parts) != 6:
            continue
        try:
            values = [int(p) for p in parts]
        except ValueError:
            continue
        out.append({
            "nature": nature.lower(),
            "evs": dict(zip(STAT_ORDER, values)),
            "percent": round(float(percent), 2),
        })
    return out


def parse_movesets(text: str) -> dict:
    """Split the moveset file into one record per Pokemon.

    The file is a series of ASCII-art boxes; we walk it line by line, tracking
    which titled section we're inside, because the sections are always the
    same five and always in the same order.
    """
    results = {}
    current_name = None
    current_section = None
    buckets = {}

    section_names = {"Abilities", "Items", "Spreads", "Moves", "Teammates"}

    def flush():
        if not current_name:
            return
        results[current_name] = {
            "abilities": _parse_percent_lines(buckets.get("Abilities", [])),
            "items": _parse_percent_lines(buckets.get("Items", [])),
            "spreads": _parse_spreads(buckets.get("Spreads", [])),
            "moves": _parse_percent_lines(buckets.get("Moves", [])),
            "teammates": _parse_percent_lines(buckets.get("Teammates", [])),
            "raw_count": buckets.get("_raw_count"),
        }

    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("+---"):
            continue
        if not stripped.startswith("|"):
            continue
        content = stripped.strip("|").strip()

        if content.startswith("Raw count:"):
            buckets["_raw_count"] = int(content.split(":")[1].strip())
            continue
        if content.startswith(("Avg. weight", "Viability Ceiling")):
            continue

        if content in section_names:
            current_section = content
            buckets[current_section] = []
            continue

        # A bare line that isn't a section header and follows a box border is
        # the next Pokemon's name.
        if current_section is None or (
            content and "%" not in content and ":" not in content and current_section == "Teammates"
        ):
            flush()
            current_name = content
            current_section = None
            buckets = {}
            continue

        buckets.setdefault(current_section, []).append(content)

    flush()
    return results


def main():
    usage_url = f"{BASE}/{MONTH}/{FORMAT}-{RATING}.txt"
    moveset_url = f"{BASE}/{MONTH}/moveset/{FORMAT}-{RATING}.txt"

    print(f"Fetching usage table: {usage_url}")
    usage = parse_usage(fetch(usage_url))
    print(f"  {len(usage)} Pokemon ranked")

    print(f"Fetching movesets:    {moveset_url}")
    movesets = parse_movesets(fetch(moveset_url))
    print(f"  {len(movesets)} Pokemon with detailed data")

    combined = {}
    for name, stats in usage.items():
        detail = movesets.get(name, {})
        combined[name] = {
            "rank": stats["rank"],
            "usage_percent": stats["usage_percent"],
            "abilities": detail.get("abilities", []),
            "items": detail.get("items", []),
            "spreads": detail.get("spreads", []),
            "moves": detail.get("moves", []),
            "teammates": detail.get("teammates", []),
        }

    with_spreads = sum(1 for v in combined.values() if v["spreads"])
    print(f"  {with_spreads} Pokemon have EV spread data")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps({
        "format": FORMAT,
        "month": MONTH,
        "rating": RATING,
        "source": "smogon",
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "pokemon": combined,
    }, indent=1))
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
