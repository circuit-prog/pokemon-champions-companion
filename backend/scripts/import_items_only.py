"""Re-import just the item table from PokeAPI, without redoing the (slow)
full Pokemon/move import.

Exists because the original import capped items at 400, which silently
dropped common competitive held items that happen to have high PokeAPI
ids (Assault Vest, Rocky Helmet, Safety Goggles, Covert Cloak, ...).

Usage:
    backend/venv/bin/python backend/scripts/import_items_only.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from scripts.import_pokeapi import import_items  # noqa: E402


def main():
    db = SessionLocal()
    try:
        import_items(db)
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
