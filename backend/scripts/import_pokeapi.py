"""Populate the local database with Pokemon/move/item/ability data from PokeAPI.

PokeAPI (pokeapi.co) is a free, public REST API with one endpoint per Pokemon/
move/item/ability - there's no bulk "give me everything" endpoint, so this
script makes one HTTP request per entity. That means importing the full
~1300-species national dex takes a while and hits PokeAPI's servers a lot.

To keep the first run fast, LIMIT below caps how many Pokemon we pull.
Once the pipeline is proven out, bump LIMIT (or set it to None for "all")
and re-run - the script uses INSERT-or-update logic so it's safe to re-run.

Usage:
    backend/venv/bin/python backend/scripts/import_pokeapi.py
"""
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import Base, engine, SessionLocal
from app.models.pokemon import Pokemon, Move, Item, Ability

POKEAPI_BASE = "https://pokeapi.co/api/v2"

# How many Pokemon (by national dex order) to import on this run.
# None = import the entire national dex (~1300 requests). We import everyone
# so the roster/search is complete; real usage data (scrape_usage_ranking.py +
# scrape_usage_detail.py) separately marks which ~83 Pokemon actually see
# competitive play in Pokemon Champions right now, and what they run.
LIMIT = None

REQUEST_DELAY_SECONDS = 0.05  # be polite to the free public API


def fetch(url):
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    time.sleep(REQUEST_DELAY_SECONDS)
    return resp.json()


def import_pokemon(db, limit):
    list_url = f"{POKEAPI_BASE}/pokemon?limit={limit or 100000}"
    entries = fetch(list_url)["results"]

    for i, entry in enumerate(entries, start=1):
        data = fetch(entry["url"])
        name = data["name"]

        existing = db.query(Pokemon).filter(Pokemon.name == name).first()
        pokemon = existing or Pokemon(id=data["id"], name=name)

        stats = {s["stat"]["name"]: s["base_stat"] for s in data["stats"]}
        types = [t["type"]["name"] for t in sorted(data["types"], key=lambda t: t["slot"])]

        pokemon.display_name = name.replace("-", " ").title()
        pokemon.type1 = types[0]
        pokemon.type2 = types[1] if len(types) > 1 else None
        pokemon.hp = stats["hp"]
        pokemon.attack = stats["attack"]
        pokemon.defense = stats["defense"]
        pokemon.special_attack = stats["special-attack"]
        pokemon.special_defense = stats["special-defense"]
        pokemon.speed = stats["speed"]
        pokemon.sprite_url = (data.get("sprites") or {}).get("front_default")

        # Link abilities (create Ability rows on the fly if we haven't seen them yet).
        pokemon.abilities = []
        for ab in data["abilities"]:
            ab_name = ab["ability"]["name"]
            ability = db.query(Ability).filter(Ability.name == ab_name).first()
            if not ability:
                ability = Ability(name=ab_name, display_name=ab_name.replace("-", " ").title())
                db.add(ability)
                db.flush()
            pokemon.abilities.append(ability)

        # Link moves this Pokemon can learn (create Move rows on the fly).
        pokemon.moves = []
        # No cap: a 40-move cap previously cut off real competitive moves (e.g. Kingambit's
        # Iron Head, ranked #4 by usage, fell outside the first 40 PokeAPI returned).
        for mv in data["moves"]:
            mv_name = mv["move"]["name"]
            move = db.query(Move).filter(Move.name == mv_name).first()
            if not move:
                move = Move(name=mv_name, display_name=mv_name.replace("-", " ").title(),
                             type="unknown", category="unknown")
                db.add(move)
                db.flush()
            pokemon.moves.append(move)

        if not existing:
            db.add(pokemon)

        db.commit()
        print(f"  [{i}/{len(entries)}] imported {pokemon.display_name}")


def enrich_moves(db):
    """Fill in real type/category/power/accuracy/effect for moves referenced above.

    We only fetch full details for moves we actually linked (via the loop
    above), not every move in the game, to keep total requests reasonable.
    """
    moves = db.query(Move).filter((Move.type == "unknown") | (Move.effect.is_(None))).all()
    print(f"Enriching {len(moves)} moves with full details...")
    for i, move in enumerate(moves, start=1):
        data = fetch(f"{POKEAPI_BASE}/move/{move.name}")
        move.type = data["type"]["name"]
        move.category = data["damage_class"]["name"] if data.get("damage_class") else "status"
        move.power = data.get("power")
        move.accuracy = data.get("accuracy")
        move.pp = data.get("pp")
        effect_entries = [e for e in (data.get("effect_entries") or []) if e["language"]["name"] == "en"]
        move.effect = effect_entries[0]["short_effect"] if effect_entries else None
        db.commit()
        if i % 10 == 0:
            print(f"  [{i}/{len(moves)}] moves enriched")


def enrich_abilities(db):
    """Fill in effect text for abilities referenced above."""
    abilities = db.query(Ability).filter(Ability.effect.is_(None)).all()
    print(f"Enriching {len(abilities)} abilities with effect text...")
    for i, ability in enumerate(abilities, start=1):
        data = fetch(f"{POKEAPI_BASE}/ability/{ability.name}")
        effect_entries = [e for e in (data.get("effect_entries") or []) if e["language"]["name"] == "en"]
        ability.effect = effect_entries[0]["short_effect"] if effect_entries else None
        db.commit()
        if i % 10 == 0:
            print(f"  [{i}/{len(abilities)}] abilities enriched")


def import_items(db, limit=None):
    # No cap: a 400-item cap previously cut off real competitive held items
    # (Assault Vest, Rocky Helmet, Safety Goggles, Covert Cloak, Booster
    # Energy, Loaded Dice...) purely because of PokeAPI's ID ordering.
    list_url = f"{POKEAPI_BASE}/item?limit={limit or 100000}"
    entries = fetch(list_url)["results"]
    print(f"Importing {len(entries)} items...")
    for i, entry in enumerate(entries, start=1):
        data = fetch(entry["url"])
        name = data["name"]
        item = db.query(Item).filter(Item.name == name).first() or Item(id=data["id"], name=name)
        item.display_name = name.replace("-", " ").title()
        item.sprite_url = (data.get("sprites") or {}).get("default")
        effect_entries = data.get("effect_entries") or []
        item.effect = effect_entries[0]["short_effect"] if effect_entries else None
        if not item.id:
            db.add(item)
        db.add(item)
        db.commit()
        if i % 20 == 0:
            print(f"  [{i}/{len(entries)}] items imported")


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        print(f"Importing Pokemon (limit={LIMIT or 'ALL'})...")
        import_pokemon(db, LIMIT)
        enrich_moves(db)
        enrich_abilities(db)
        import_items(db)
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
