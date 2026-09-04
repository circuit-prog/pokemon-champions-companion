"""Load backend/data/limitless_tournaments.json (from
scrape_limitless_tournaments.py) into the tournaments/tournament_results
tables.

Idempotent: a tournament already present (matched by its limitlessvgc.com
external_id) is skipped entirely, so this is safe to rerun on a schedule -
each run only adds tournaments that weren't there before. Unlike
load_pikalytics_data.py's usage stats (a snapshot, fully replaced each run),
tournament results are historical record, so nothing already loaded is ever
deleted or overwritten by the scraper - hand-edits made through the admin
form (adding real sets to a scraped result, say) are never clobbered by a
later scrape.

Usage:
    backend/venv/bin/python backend/scripts/load_limitless_tournaments.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models.pokemon import Pokemon
from app.models.tournament import Tournament, TournamentResult

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "limitless_tournaments.json"


def main():
    data = json.loads(DATA_PATH.read_text())

    db = SessionLocal()
    try:
        known_slugs = {p.name for p in db.query(Pokemon.name).all()}

        def resolve_slug(slug):
            """Species with gender/battle/family forms (Basculegion, Maushold,
            Aegislash, ...) aren't in PokeAPI under their plain species name -
            same fallback load_pikalytics_data.py already uses: take the
            first variant, which is the one people mean."""
            if slug in known_slugs:
                return slug
            variant = (
                db.query(Pokemon.name)
                .filter(Pokemon.name.like(f"{slug}-%"))
                .order_by(Pokemon.id)
                .first()
            )
            return variant[0] if variant else None

        added, skipped_existing = 0, 0
        for entry in data:
            if not entry.get("date"):
                print(f"  skip '{entry['name']}': couldn't parse a date")
                continue

            existing = (
                db.query(Tournament).filter(Tournament.external_id == entry["external_id"]).first()
            )
            if existing:
                skipped_existing += 1
                continue

            tournament = Tournament(
                name=entry["name"],
                date=entry["date"],
                player_count=entry.get("player_count"),
                source_url=entry.get("source_url"),
                external_id=entry["external_id"],
            )
            db.add(tournament)
            db.flush()  # assigns tournament.id for the results below

            unmatched = set()
            for r in entry["results"]:
                roster = []
                for slug in r["roster"]:
                    resolved = resolve_slug(slug)
                    if not resolved:
                        unmatched.add(slug)
                        continue
                    roster.append({"pokemon_name": resolved, "evs": {}, "nature": "hardy", "moves": []})
                if not roster:
                    continue
                db.add(
                    TournamentResult(
                        tournament_id=tournament.id,
                        placement=r["placement"],
                        player=r.get("player"),
                        roster_json=json.dumps(roster),
                        is_dark_horse=False,
                    )
                )
            db.commit()
            added += 1
            note = f" (unmatched: {', '.join(sorted(unmatched))})" if unmatched else ""
            print(f"  added '{tournament.name}' ({len(entry['results'])} results){note}")

        print(f"Added {added} new tournaments, skipped {skipped_existing} already loaded.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
