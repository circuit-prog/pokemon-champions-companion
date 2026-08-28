"""Load the scraped usage_ranking.json + usage_detail.json into the
pokemon_usage_stats table, matching against Pokemon already imported by
import_pokeapi.py.

Run scrape_usage_ranking.py and scrape_usage_detail.py first.

Usage:
    backend/venv/bin/python backend/scripts/load_usage_data.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models.pokemon import Pokemon, PokemonUsageStats

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
FORMAT = "m-a"


def main():
    ranking = json.loads((DATA_DIR / "usage_ranking.json").read_text())
    detail = json.loads((DATA_DIR / "usage_detail.json").read_text())

    db = SessionLocal()
    loaded, skipped = 0, 0
    try:
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
            db.commit()
            loaded += 1

        print(f"Loaded usage stats for {loaded} Pokemon ({skipped} skipped, not yet imported).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
