"""Standalone pass to fill in Move.effect / Ability.effect for rows already in
the DB, without re-running the (slow) full Pokemon import. Run this after
import_pokeapi.py if it was run before effect enrichment was added.

Usage:
    backend/venv/bin/python backend/scripts/enrich_effects.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from scripts.import_pokeapi import enrich_moves, enrich_abilities  # noqa: E402


def main():
    db = SessionLocal()
    try:
        enrich_moves(db)
        enrich_abilities(db)
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
