"""Load the scraped Smogon usage data into the database.

Replaces the per-Pokemon usage table wholesale on each run, because ranks
shift and a Pokemon that dropped out of the meta should drop out of our data
too. Team cores and top tournament teams are left alone - those come from
Pikalytics and Smogon has no equivalent.

Names that don't resolve to a Pokemon in our dex are reported rather than
silently skipped, so it's obvious when the dex needs another import.

Usage:
    backend/venv/bin/python backend/scripts/load_smogon_data.py
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base, engine, SessionLocal  # noqa: E402
from app.models.pokemon import PokemonUsageStats, UsageSnapshot  # noqa: E402
from app.name_resolver import resolve_names  # noqa: E402

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "smogon_usage.json"


PIKALYTICS_PATH = Path(__file__).resolve().parent.parent / "data" / "pikalytics_usage.json"


def _overlay_pikalytics_win_rates(db) -> int:
    """Copy win rate and record from the Pikalytics scrape onto matching rows.

    Pikalytics keys its data by our slug already, so this is a direct lookup.
    Missing file just means nobody has run that scraper - not an error.
    """
    if not PIKALYTICS_PATH.exists():
        return 0

    from app.models.pokemon import Pokemon

    payload = json.loads(PIKALYTICS_PATH.read_text())
    count = 0
    for slug, data in payload.get("pokemon", {}).items():
        if data.get("win_rate") is None and not data.get("record"):
            continue
        pokemon = db.query(Pokemon).filter(Pokemon.name == slug).first()
        if not pokemon:
            continue
        row = (
            db.query(PokemonUsageStats)
            .filter(PokemonUsageStats.pokemon_id == pokemon.id)
            .first()
        )
        if not row:
            continue
        row.win_rate = data.get("win_rate")
        row.record = data.get("record")
        count += 1
    db.commit()
    return count


def main():
    Base.metadata.create_all(bind=engine)
    payload = json.loads(DATA_PATH.read_text())
    entries = payload["pokemon"]
    fmt = payload["format"]
    scraped_at = payload.get("scraped_at") or datetime.now(timezone.utc).isoformat()

    db = SessionLocal()
    try:
        resolved = resolve_names(db, set(entries.keys()))

        db.query(PokemonUsageStats).delete()
        db.commit()

        loaded, unresolved = 0, []
        for display_name, data in entries.items():
            slug = resolved.get(display_name, (None, None))[0]
            if not slug:
                unresolved.append(display_name)
                continue

            from app.models.pokemon import Pokemon
            pokemon = db.query(Pokemon).filter(Pokemon.name == slug).first()
            if not pokemon:
                unresolved.append(display_name)
                continue

            db.add(PokemonUsageStats(
                pokemon_id=pokemon.id,
                format=fmt,
                rank=data["rank"],
                usage_percent=data.get("usage_percent"),
                win_rate=None,   # Smogon publishes usage, not win rate
                record=None,
                moves_json=json.dumps(data.get("moves", [])),
                items_json=json.dumps(data.get("items", [])),
                abilities_json=json.dumps(data.get("abilities", [])),
                teammates_json=json.dumps(data.get("teammates", [])),
                spreads_json=json.dumps(data.get("spreads", [])),
            ))

            db.add(UsageSnapshot(
                format=fmt,
                scraped_at=scraped_at,
                pokemon_name=slug,
                rank=data["rank"],
                win_rate=None,
                record=None,
            ))
            loaded += 1

        db.commit()
        print(f"Loaded {loaded} Pokemon with usage data.")

        # Smogon publishes usage but not win rate; Pikalytics publishes win
        # rate and record for its top 50. Overlay those so we keep both rather
        # than losing win rate in the switch.
        overlaid = _overlay_pikalytics_win_rates(db)
        if overlaid:
            print(f"Overlaid Pikalytics win rate/record onto {overlaid} of them.")
        if unresolved:
            print(f"{len(unresolved)} names didn't match anything in our dex:")
            for name in unresolved:
                print(f"  - {name}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
