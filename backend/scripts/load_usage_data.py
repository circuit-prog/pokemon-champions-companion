"""Load the scraped usage_ranking.json + usage_detail.json into the
pokemon_usage_stats table, matching against Pokemon already imported by
import_pokeapi.py.

Run scrape_usage_ranking.py and scrape_usage_detail.py first.

Deletes every existing pokemon_usage_stats row before loading the fresh
ranking, rather than only touching rows for Pokemon still present in it -
otherwise a Pokemon that drops out of the current regulation's top ranking
(because it fell off in usage, or because the ranking now reflects a new
regulation entirely) would keep showing its last-known rank/usage% forever
instead of correctly becoming "untracked".

Usage:
    backend/venv/bin/python backend/scripts/load_usage_data.py
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models.pokemon import Pokemon, PokemonUsageStats, UsageSnapshot

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
FORMAT_PATH = DATA_DIR / "usage_format.json"
# Same fallback as scrape_usage_detail.py - only matters if this is run
# standalone before the ranking scraper has produced its sidecar file.
FORMAT = json.loads(FORMAT_PATH.read_text())["format"] if FORMAT_PATH.exists() else "m-b"


def main():
    ranking = json.loads((DATA_DIR / "usage_ranking.json").read_text())
    detail = json.loads((DATA_DIR / "usage_detail.json").read_text())
    scraped_at = datetime.now(timezone.utc).isoformat()

    db = SessionLocal()
    loaded, skipped = 0, 0
    try:
        deleted = db.query(PokemonUsageStats).delete()
        db.commit()
        print(f"Cleared {deleted} existing usage stats rows before reloading ({FORMAT}).")
        for entry in ranking:
            pokemon = db.query(Pokemon).filter(Pokemon.name == entry["name"]).first()
            if not pokemon:
                # Pokemon with battle forms (Aegislash, Mimikyu, Basculegion, ...) aren't
                # in PokeAPI under their plain species name - fall back to the first
                # variant, e.g. "aegislash" -> "aegislash-shield".
                pokemon = (
                    db.query(Pokemon)
                    .filter(Pokemon.name.like(f"{entry['name']}-%"))
                    .order_by(Pokemon.id)
                    .first()
                )
            if not pokemon:
                print(f"  skip: '{entry['name']}' not found in pokemon table (import Pokemon first)")
                skipped += 1
                continue

            d = detail.get(entry["name"], {"moves": [], "items": [], "abilities": []})
            stats = db.query(PokemonUsageStats).filter(PokemonUsageStats.pokemon_id == pokemon.id).first()
            stats = stats or PokemonUsageStats(pokemon_id=pokemon.id)
            stats.format = FORMAT
            stats.rank = entry["rank"]
            stats.usage_percent = entry.get("usage_percent")
            stats.moves_json = json.dumps(d["moves"])
            stats.items_json = json.dumps(d["items"])
            stats.abilities_json = json.dumps(d["abilities"])
            db.add(stats)

            # Powers the /api/meta/freshness indicator and usage trend
            # charts - load_smogon_data.py already does this for its own
            # source; this loader needs the same so freshness doesn't go
            # blank whenever limitlessvgc (not Smogon) is the active source,
            # e.g. right after a new regulation launches and Smogon hasn't
            # published stats for it yet.
            existing_snapshot = (
                db.query(UsageSnapshot)
                .filter(
                    UsageSnapshot.format == FORMAT,
                    UsageSnapshot.scraped_at == scraped_at,
                    UsageSnapshot.pokemon_name == pokemon.name,
                )
                .first()
            )
            if existing_snapshot:
                existing_snapshot.rank = entry["rank"]
            else:
                db.add(UsageSnapshot(
                    format=FORMAT,
                    scraped_at=scraped_at,
                    pokemon_name=pokemon.name,
                    rank=entry["rank"],
                    win_rate=None,
                    record=None,
                ))

            db.commit()
            loaded += 1

        print(f"Loaded usage stats for {loaded} Pokemon ({skipped} skipped, not yet imported).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
