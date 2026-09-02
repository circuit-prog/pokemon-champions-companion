"""Report which damage-affecting abilities the meta actually runs, and whether
we model them.

The point is to know what's missing rather than discover it one bug report at
a time. Ranked by the highest-usage Pokemon carrying each ability, so the ones
that distort the most calculations come first.

Usage (from backend/):
    venv/bin/python scripts/ability_coverage.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.pokemon import PokemonUsageStats  # noqa: E402
from app import abilities as ab  # noqa: E402

# Abilities that change a damage roll. Compiled by hand - no data source we
# have marks them, and PokeAPI's effect text isn't structured enough to parse.
DAMAGE_AFFECTING = {
    "pixilate", "aerilate", "refrigerate", "galvanize", "normalize", "liquid-voice",
    "huge-power", "pure-power", "hustle", "guts", "solar-power", "flower-gift",
    "gorilla-tactics", "quark-drive", "protosynthesis", "orichalcum-pulse",
    "hadron-engine", "intrepid-sword", "download", "beast-boost", "moxie",
    "defiant", "competitive", "supreme-overlord", "sharpness", "toxic-boost",
    "flare-boost", "slow-start", "victory-star",
    "technician", "steelworker", "steely-spirit", "dragons-maw", "rocky-payload",
    "transistor", "water-bubble", "sand-force", "overgrow", "blaze", "torrent",
    "swarm", "tough-claws", "iron-fist", "strong-jaw", "mega-launcher",
    "punk-rock", "reckless", "sheer-force", "analytic", "stakeout", "rivalry",
    "sniper", "neuroforce", "tinted-lens", "adaptability", "dark-aura", "fairy-aura",
    "multiscale", "shadow-shield", "ice-scales", "fur-coat", "thick-fat",
    "heatproof", "purifying-salt", "filter", "solid-rock", "prism-armor",
    "dry-skin", "fluffy", "wonder-guard", "marvel-scale", "grass-pelt",
    "aura-break", "friend-guard", "battle-armor", "shell-armor",
    "levitate", "flash-fire", "water-absorb", "volt-absorb", "storm-drain",
    "lightning-rod", "motor-drive", "sap-sipper", "earth-eater",
    "well-baked-body", "soundproof", "bulletproof", "overcoat",
    "drought", "drizzle", "sand-stream", "snow-warning", "desolate-land",
    "primordial-sea", "delta-stream", "electric-surge", "psychic-surge",
    "grassy-surge", "misty-surge",
}

MODELLED = (
    set(ab.ATE_ABILITIES)
    | set(ab.TYPE_BOOST_ABILITIES)
    | set(ab.PINCH_ABILITIES)
    | set(ab.DEFENSIVE_TYPE_RESIST)
    | set(ab.IMMUNITY_ABILITIES)
    | set(ab.WEATHER_SETTERS)
    | set(ab.TERRAIN_SETTERS)
    | set(ab.AURA_ABILITIES)
    | {
        ab.NORMALIZE, "liquid-voice", "soundproof", "punk-rock", "sharpness",
        "bulletproof", "overcoat", "marvel-scale", "battle-armor", "shell-armor",
        "aura-break", "huge-power", "pure-power", "hustle", "guts", "solar-power",
        "technician", "sand-force", "adaptability", "tinted-lens", "neuroforce",
        "filter", "solid-rock", "prism-armor", "multiscale", "shadow-shield",
        "ice-scales", "fur-coat", "dry-skin", "wonder-guard",
    }
)


def main():
    db = SessionLocal()
    meta_abilities = {}
    for row in db.query(PokemonUsageStats).order_by(PokemonUsageStats.rank).all():
        if not row.pokemon:
            continue
        for entry in json.loads(row.abilities_json or "[]"):
            slug = entry["name"].lower().replace(" ", "-")
            meta_abilities.setdefault(slug, []).append((row.rank, row.pokemon.display_name))

    relevant = {a for a in meta_abilities if a in DAMAGE_AFFECTING}
    missing = sorted(relevant - MODELLED, key=lambda a: min(r for r, _ in meta_abilities[a]))
    covered = sorted(relevant & MODELLED, key=lambda a: min(r for r, _ in meta_abilities[a]))

    print(f"Abilities carried by ranked Pokemon: {len(meta_abilities)}")
    print(f"  damage-affecting: {len(relevant)}")
    print(f"  modelled:         {len(covered)}")
    print(f"  not modelled:     {len(missing)}")
    print()
    print("NOT MODELLED, best rank carrying it first:")
    print(f"{'ability':24} {'rank':>5}  carried by")
    print("-" * 74)
    for slug in missing:
        entries = sorted(meta_abilities[slug])
        if slug in ab.NEEDS_MOVE_FLAG:
            why = "needs a move flag"
        elif slug in ab.NEEDS_BATTLE_STATE:
            why = "needs battle state - use stat stages"
        elif slug == "friend-guard":
            why = "ally-side; use the Friend Guard field toggle"
        else:
            why = "not yet modelled"
        names = ", ".join(n for _, n in entries[:2])
        print(f"{slug:24} {entries[0][0]:>5}  {names}{('  [' + why + ']') if why else ''}")


if __name__ == "__main__":
    main()
