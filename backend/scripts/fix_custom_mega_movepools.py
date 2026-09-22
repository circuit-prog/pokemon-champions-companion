"""Some Champions-exclusive Mega Evolutions are fan-contributed entries in
PokeAPI that have real base stats/types/abilities but an empty movepool
(confirmed directly against PokeAPI itself, not just our own import - e.g.
GET https://pokeapi.co/api/v2/pokemon/baxcalibur-mega returns 0 moves).

In the actual games, a Mega Evolution always shares its base form's full
learnset - Mega Evolving doesn't add or remove moves. So for the specific
Mega forms PokeAPI hasn't populated, this copies the base species' real
movepool over directly, rather than leaving them impossible to build a
moveset for in the Team Builder.

Idempotent and safe to rerun - only touches a Mega if PokeAPI still hasn't
given it its own moves by the time this runs, so a future PokeAPI update
that DOES add moves for one of these will stop being overwritten
automatically.

Run after import_pokeapi.py (already called from its main() - see bottom
of that file), or by hand:
    backend/venv/bin/python backend/scripts/fix_custom_mega_movepools.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models.pokemon import Pokemon

# mega slug -> base species slug. Found by checking every custom (non-Gen-6-
# canon) Mega Evolution in our dex against PokeAPI directly for an empty
# moves list, 2026-09-22.
CUSTOM_MEGA_BASE_SPECIES = {
    "baxcalibur-mega": "baxcalibur",
    "golisopod-mega": "golisopod",
    "absol-mega-z": "absol",
    "garchomp-mega-z": "garchomp",
    "lucario-mega-z": "lucario",
}


def main(db=None):
    owns_session = db is None
    db = db or SessionLocal()
    try:
        fixed = 0
        for mega_name, base_name in CUSTOM_MEGA_BASE_SPECIES.items():
            mega = db.query(Pokemon).filter(Pokemon.name == mega_name).first()
            if not mega:
                print(f"  skip {mega_name}: not in our dex yet")
                continue
            if mega.moves:
                continue  # PokeAPI has since given it real moves - leave it alone
            base = db.query(Pokemon).filter(Pokemon.name == base_name).first()
            if not base or not base.moves:
                print(f"  skip {mega_name}: base species '{base_name}' has no moves either")
                continue
            mega.moves = list(base.moves)
            fixed += 1
            print(f"  {mega_name}: copied {len(base.moves)} moves from {base_name}")
        db.commit()
        print(f"Fixed {fixed} custom Mega movepool(s).")
    finally:
        if owns_session:
            db.close()


if __name__ == "__main__":
    main()
