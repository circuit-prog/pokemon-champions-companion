"""Scrape official Pokemon Champions (Regulation M-B) tournament results from
limitlessvgc.com: which events happened, who placed where, their team
(item/ability/nature/moves - no EVs, see below), and tournament-wide
"most successful Pokemon" stats.

Only scrapes limitlessvgc.com, whose robots.txt allows crawling everything
(`Disallow:` with no paths). RK9.gg also has full team sets, but its
robots.txt explicitly disallows /roster/, /pairings/, /decklist/public/,
and the teamlist paths - exactly where that data lives - so this
deliberately never touches RK9.gg. Turns out limitlessvgc.com has (almost)
the same data on its own /tournaments/<id>/teams page, which robots.txt
does allow: item, ability, nature and all 4 moves per Pokemon. The one
thing it doesn't have anywhere is EVs (checked: no Spreads/EVs section
exists on Limitless at all) - add those by hand through the admin form for
any specific result you want fully filled in.

Per M-B tournament:
  /tournaments/<id>            - date, player count, format, top-128 standings
                                  (rank/player/player-id/species roster)
  /tournaments/<id>/teams      - full sets (item/ability/nature/moves) per
                                  placement, matched up with the roster above
  /tournaments/<id>/statistics - "most successful Pokemon" across every
                                  tracked player (a larger sample than the
                                  top 128 above), with win-rate context

Plus, once per unique player encountered across every result (cached for
the whole run, since the same player often appears in multiple
tournaments):
  /players/<id>                - career stats (money won, points earned,
                                  top-cut counts by tier) and, matched
                                  against the current tournament's own id,
                                  the prize money/points that one result
                                  specifically paid out

Writes backend/data/limitless_tournaments.json:
[{"external_id", "name", "date", "player_count", "source_url",
  "results": [{"placement", "player", "player_external_id",
               "prize_money", "points",
               "roster": [{"pokemon_name", "item", "ability", "nature",
                           "moves": [...]}]}],
  "stats": [{"pokemon_name", "count", "share_percent", "points"}],
  "players": {"<player_external_id>": {"name", "country", "money_won",
                                        "points_earned", "top_cuts"}}}]

Display names (item/ability/nature/move text) are resolved to our own dex
slugs in load_limitless_tournaments.py, not here - this script stays
DB-agnostic like the site's other scrapers.

Usage:
    backend/venv/bin/python backend/scripts/scrape_limitless_tournaments.py
"""
import json
import re
import time
from datetime import datetime
from pathlib import Path

import requests
from bs4 import BeautifulSoup

BASE = "https://limitlessvgc.com"
TARGET_FORMAT = "m-b"  # the only Champions regulation this app tracks
TOP_N_RESULTS = 128
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
        player_link = row.select_one("a[href^='/players/']")
        player_external_id = player_link["href"].rsplit("/", 1)[-1] if player_link else None
        results.append({
            "placement": int(rank),
            "player": player,
            "player_external_id": player_external_id,
            "roster": roster,
        })
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


def parse_teams(html):
    """The /teams page: full sets (item/ability/nature/moves - no EVs, see
    the module docstring) per placement. Returns {placement: [{"pokemon_name",
    "item", "ability", "nature", "moves"}]}."""
    soup = BeautifulSoup(html, "lxml")
    teams = {}
    for toggle in soup.select(".teamlist-toggle[data-target]"):
        m = re.match(r"team-(\d+)$", toggle.get("data-target", ""))
        if not m:
            continue
        placement = int(m.group(1))
        container = soup.select_one(f'[data-name="{toggle["data-target"]}"]')
        if not container:
            continue
        pokes = []
        for pkmn in container.select(".pkmn[data-id]"):
            item_el = pkmn.select_one(".item")
            ability_el = pkmn.select_one(".ability")
            nature_el = pkmn.select_one(".nature")
            pokes.append({
                "pokemon_name": pkmn["data-id"],
                "item": item_el.get_text(strip=True) if item_el else None,
                "ability": ability_el.get_text(strip=True).removeprefix("Ability: ") if ability_el else None,
                "nature": nature_el.get_text(strip=True).removesuffix(" Nature") if nature_el else None,
                "moves": [li.get_text(strip=True) for li in pkmn.select("ul.moves li")],
            })
        teams[placement] = pokes
    return teams


def parse_statistics(html):
    """The /statistics page's "Most successful Pokemon" table - a larger
    sample than the top-32 results (every tracked player), with win-rate
    context via `points`."""
    soup = BeautifulSoup(html, "lxml")
    stats = []
    for row in soup.select("table.data-table tr[data-count]"):
        img = row.select_one("img.pokemon[alt]")
        cells = row.find_all("td")
        if not img or len(cells) < 6:
            continue
        share_text = cells[4].get_text(strip=True).rstrip("%")
        stats.append({
            "pokemon_name": img["alt"],
            "count": int(row.get("data-count", 0)),
            "share_percent": float(share_text) if share_text.replace(".", "", 1).isdigit() else None,
            "points": int(row["data-points"]) if row.get("data-points") else None,
        })
    return stats


def parse_player_career(html):
    """A player's own page: career totals - name, country, money won,
    points earned, and top-cut counts by tier. One-time per player, safe to
    cache and reuse across every tournament they appear in this run."""
    soup = BeautifulSoup(html, "lxml")

    heading = soup.select_one(".infobox-heading")
    name = heading.get_text(strip=True) if heading else None
    flag = soup.select_one(".infobox-heading img.flag")
    country = flag["alt"] if flag else None

    money_won, points_earned = None, None
    for table in soup.select("table.data-table.center"):
        rows = table.select("tr")
        if len(rows) >= 2:
            cells = rows[1].find_all("td")
            if len(cells) >= 2:
                money_won = cells[0].get_text(strip=True) or None
                points_text = re.sub(r"\D", "", cells[1].get_text(strip=True))
                points_earned = int(points_text) if points_text else None

    top_cuts = {}
    for table in soup.select("table.data-table"):
        header = table.select_one("tr")
        if not header or not header.get_text(strip=True).startswith("Top Cuts"):
            continue
        for row in table.select("tr")[1:]:
            cells = row.find_all("td")
            if len(cells) != 6:
                continue
            tier = cells[0].get_text(strip=True).lower()
            top_cuts[tier] = {
                "1st": int(cells[1].get_text(strip=True) or 0),
                "2nd": int(cells[2].get_text(strip=True) or 0),
                "t4": int(cells[3].get_text(strip=True) or 0),
                "t8": int(cells[4].get_text(strip=True) or 0),
                "total": int(cells[5].get_text(strip=True) or 0),
            }

    return {"name": name, "country": country, "money_won": money_won, "points_earned": points_earned, "top_cuts": top_cuts}


def extract_result_payout(html, tournament_external_id):
    """From the SAME player page, what prize money/points that one specific
    tournament (by its external_id) paid out - re-derived per tournament
    even when the player page itself is cached, since a cached player's
    page holds their WHOLE history, not just the current event."""
    soup = BeautifulSoup(html, "lxml")
    for row in soup.select("section table.data-table.striped tr"):
        if not row.select_one(f'a[href="/tournaments/{tournament_external_id}"]'):
            continue
        cells = row.find_all("td")
        if len(cells) >= 7:
            prize_money = cells[5].get_text(strip=True) or None
            points_text = cells[6].get_text(strip=True)
            points = int(points_text) if points_text.isdigit() else None
            return prize_money, points
        break
    return None, None


def main():
    print("Finding Regulation M-B tournaments...")
    listing = find_mb_tournaments()
    print(f"Found {len(listing)} M-B tournaments.")

    # Cache players across the whole run - the same person often places in
    # more than one tournament. Cache the raw HTML (not just the parsed
    # career info), since prize money/points must be re-derived per
    # tournament even for an already-seen player - their page holds their
    # whole history, not just whichever event we first fetched them for.
    player_html_cache = {}
    player_career_cache = {}

    tournaments = []
    for i, entry in enumerate(listing, start=1):
        external_id = entry["external_id"]
        try:
            html = fetch(f"{BASE}/tournaments/{external_id}")
            parsed = parse_tournament(html, external_id)
            if not parsed:
                print(f"  [{i}/{len(listing)}] {entry['name']}: skipped (not M-B on detail page)")
                continue

            teams_html = fetch(f"{BASE}/tournaments/{external_id}/teams")
            teams_by_placement = parse_teams(teams_html)
            for result in parsed["results"]:
                full_sets = teams_by_placement.get(result["placement"], [])
                by_species = {s["pokemon_name"]: s for s in full_sets}
                result["roster"] = [
                    by_species.get(slug, {"pokemon_name": slug, "item": None, "ability": None, "nature": None, "moves": []})
                    for slug in result["roster"]
                ]

            stats_html = fetch(f"{BASE}/tournaments/{external_id}/statistics")
            parsed["stats"] = parse_statistics(stats_html)

            players = {}
            for result in parsed["results"]:
                pid = result.get("player_external_id")
                if not pid:
                    continue
                try:
                    if pid not in player_html_cache:
                        player_html_cache[pid] = fetch(f"{BASE}/players/{pid}")
                        player_career_cache[pid] = parse_player_career(player_html_cache[pid])
                    result["prize_money"], result["points"] = extract_result_payout(
                        player_html_cache[pid], external_id
                    )
                    players[pid] = player_career_cache[pid]
                except Exception as e:
                    print(f"    player {pid} FAILED ({e})")
            parsed["players"] = players

            tournaments.append(parsed)
            print(f"  [{i}/{len(listing)}] {parsed['name']}: {len(parsed['results'])} results, "
                  f"{len(parsed['stats'])} stat rows")
        except Exception as e:
            print(f"  [{i}/{len(listing)}] {entry['name']}: FAILED ({e})")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(tournaments, indent=2))
    print(f"Wrote {len(tournaments)} tournaments to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
