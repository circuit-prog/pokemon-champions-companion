"""Load both scraped tournament JSON files - backend/data/limitless_tournaments.json
(official in-person events, from scrape_limitless_tournaments.py) and
backend/data/limitless_online_tournaments.json (community online events,
from scrape_online_tournaments.py) - into the tournaments/tournament_results
tables. Both files share the same shape, so one loader handles both.

Idempotent: a tournament already present (matched by its source site's own
external_id) is skipped entirely, so this is safe to rerun on a schedule -
each run only adds tournaments that weren't there before. Unlike
load_pikalytics_data.py's usage stats (a snapshot, fully replaced each run),
tournament results are historical record, so nothing already loaded is ever
deleted or overwritten by a scrape - hand-edits made through the admin form
(adding real sets to a scraped result, say) are never clobbered by a later
scrape.

Usage:
    backend/venv/bin/python backend/scripts/load_limitless_tournaments.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models.pokemon import Ability, Item, Move, Pokemon
from app.models.tournament import Player, Tournament, TournamentResult

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
IN_PERSON_PATH = DATA_DIR / "limitless_tournaments.json"
ONLINE_PATH = DATA_DIR / "limitless_online_tournaments.json"


def load_entries(db, data, is_online, known_slugs, item_by_name, ability_by_name, move_by_name):
    def resolve_slug(slug):
        """Species with gender/battle/family forms (Basculegion, Maushold,
        Aegislash, ...) aren't in PokeAPI under their plain species name -
        same fallback load_pikalytics_data.py already uses: take the first
        variant, which is the one people mean."""
        if slug in known_slugs:
            return slug
        variant = (
            db.query(Pokemon.name)
            .filter(Pokemon.name.like(f"{slug}-%"))
            .order_by(Pokemon.id)
            .first()
        )
        return variant[0] if variant else None

    added, skipped_existing, players_upserted = 0, 0, 0
    for entry in data:
        if not entry.get("date"):
            print(f"  skip '{entry['name']}': couldn't parse a date")
            continue

        # Refresh player career stats every run regardless of whether the
        # tournament itself is new - a player's totals keep growing after
        # we've already loaded the events they came from. Online
        # tournaments don't have per-player career pages, so this is a
        # no-op for them (entry.get("players") is empty).
        for pid, info in entry.get("players", {}).items():
            player = db.query(Player).filter(Player.external_id == pid).first()
            if not player:
                player = Player(external_id=pid)
                db.add(player)
            player.name = info.get("name") or player.name or pid
            player.country = info.get("country")
            player.money_won = info.get("money_won")
            player.points_earned = info.get("points_earned")
            player.top_cuts_json = json.dumps(info.get("top_cuts", {}))
            players_upserted += 1
        db.commit()

        existing = db.query(Tournament).filter(Tournament.external_id == entry["external_id"]).first()
        if existing:
            skipped_existing += 1
            continue

        stats = []
        for s in entry.get("stats", []):
            resolved = resolve_slug(s["pokemon_name"])
            if not resolved:
                continue
            stats.append({
                "pokemon_name": resolved,
                "count": s["count"],
                "share_percent": s.get("share_percent"),
                "points": s.get("points"),
            })

        tournament = Tournament(
            name=entry["name"],
            date=entry["date"],
            format=entry.get("format", "m-b"),
            player_count=entry.get("player_count"),
            source_url=entry.get("source_url"),
            external_id=entry["external_id"],
            stats_json=json.dumps(stats) if stats else None,
            is_online=is_online,
        )
        db.add(tournament)
        db.flush()  # assigns tournament.id for the results below

        unmatched = set()
        for r in entry["results"]:
            roster = []
            for slot in r["roster"]:
                resolved = resolve_slug(slot["pokemon_name"])
                if not resolved:
                    unmatched.add(slot["pokemon_name"])
                    continue
                item = item_by_name.get((slot.get("item") or "").lower())
                ability = ability_by_name.get((slot.get("ability") or "").lower())
                moves = [move_by_name[m.lower()] for m in slot.get("moves", []) if m.lower() in move_by_name]
                nature = (slot.get("nature") or "hardy").lower()
                roster.append({
                    "pokemon_name": resolved,
                    "item": item,
                    "ability": ability,
                    "nature": nature,
                    "evs": {},
                    "moves": moves,
                })
            if not roster:
                continue
            db.add(
                TournamentResult(
                    tournament_id=tournament.id,
                    placement=r["placement"],
                    player=r.get("player"),
                    roster_json=json.dumps(roster),
                    is_dark_horse=False,
                    player_external_id=r.get("player_external_id"),
                    prize_money=r.get("prize_money"),
                    points=r.get("points"),
                    record=r.get("record"),
                )
            )
        db.commit()
        added += 1
        note = f" (unmatched: {', '.join(sorted(unmatched))})" if unmatched else ""
        print(f"  added '{tournament.name}' ({len(entry['results'])} results){note}")

    return added, skipped_existing, players_upserted


def main():
    db = SessionLocal()
    try:
        known_slugs = {p.name for p in db.query(Pokemon.name).all()}
        item_by_name = {i.display_name.lower(): i.name for i in db.query(Item.display_name, Item.name).all()}
        ability_by_name = {a.display_name.lower(): a.name for a in db.query(Ability.display_name, Ability.name).all()}
        move_by_name = {m.display_name.lower(): m.name for m in db.query(Move.display_name, Move.name).all()}

        for path, is_online, label in [
            (IN_PERSON_PATH, False, "in-person"),
            (ONLINE_PATH, True, "online"),
        ]:
            if not path.exists():
                print(f"Skipping {label}: {path} doesn't exist (run the matching scraper first).")
                continue
            data = json.loads(path.read_text())
            added, skipped_existing, players_upserted = load_entries(
                db, data, is_online, known_slugs, item_by_name, ability_by_name, move_by_name
            )
            print(f"{label}: added {added} new tournaments, skipped {skipped_existing} already loaded, "
                  f"upserted {players_upserted} player records.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
