"""Load backend/data/pikalytics_usage.json into pokemon_usage_stats,
REPLACING any existing rows (e.g. the older limitlessvgc.com M-A data,
which covers a regulation with no Mega Pokemon and is superseded by this
richer, current-regulation Pikalytics data).

Run scrape_pikalytics.py first.

Usage:
    backend/venv/bin/python backend/scripts/load_pikalytics_data.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models.pokemon import Pokemon, PokemonUsageStats, TeamCore, TopTeam, UsageSnapshot

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "pikalytics_usage.json"


def main():
    data = json.loads(DATA_PATH.read_text())
    fmt = data["format"]

    db = SessionLocal()
    try:
        deleted = db.query(PokemonUsageStats).delete()
        db.commit()
        print(f"Cleared {deleted} existing usage rows.")

        loaded, skipped = 0, 0
        for slug, entry in data["pokemon"].items():
            pokemon = db.query(Pokemon).filter(Pokemon.name == slug).first()
            if not pokemon:
                # Gendered/family form species (Basculegion, Maushold, Pyroar, ...)
                # aren't in PokeAPI under their plain species name.
                pokemon = (
                    db.query(Pokemon)
                    .filter(Pokemon.name.like(f"{slug}-%"))
                    .order_by(Pokemon.id)
                    .first()
                )
            if not pokemon:
                print(f"  skip: '{slug}' not found in pokemon table")
                skipped += 1
                continue

            stats = PokemonUsageStats(
                pokemon_id=pokemon.id,
                format=fmt,
                rank=entry["rank"],
                usage_percent=None,  # Pikalytics doesn't publish a usage % for this format
                win_rate=entry.get("win_rate"),
                record=entry.get("record"),
                moves_json=json.dumps(entry["moves"]),
                items_json=json.dumps(entry["items"]),
                abilities_json=json.dumps(entry["abilities"]),
                teammates_json=json.dumps(entry["teammates"]),
            )
            db.add(stats)
            db.commit()
            loaded += 1

        print(f"Loaded usage stats for {loaded} Pokemon ({skipped} skipped).")

        # Team cores and top teams are fully replaced each run (they're a
        # snapshot of the current meta, not accumulated history).
        db.query(TeamCore).delete()
        for core in data.get("cores", []):
            db.add(TeamCore(
                format=fmt, size=core["size"], rank=core["rank"],
                pokemon_json=json.dumps(core["pokemon"]),
                teams=core.get("teams"), usage_percent=core.get("usage_percent"),
            ))
        db.commit()
        print(f"Loaded {len(data.get('cores', []))} team cores.")

        db.query(TopTeam).delete()
        for team in data.get("top_teams", []):
            db.add(TopTeam(
                format=fmt, rank=team["rank"], author=team.get("author"),
                record=team.get("record"), tournament=team.get("tournament"),
                pokemon_json=json.dumps(team["pokemon"]),
            ))
        db.commit()
        print(f"Loaded {len(data.get('top_teams', []))} top teams.")

        # Snapshots ACCUMULATE - one row per Pokemon per scrape run, so we can
        # chart usage/win-rate trends once enough runs have happened.
        scraped_at = data.get("scraped_at")
        if scraped_at:
            existing = (
                db.query(UsageSnapshot)
                .filter(UsageSnapshot.format == fmt, UsageSnapshot.scraped_at == scraped_at)
                .count()
            )
            if existing:
                print(f"Snapshot for {scraped_at} already recorded, skipping.")
            else:
                for slug, entry in data["pokemon"].items():
                    db.add(UsageSnapshot(
                        format=fmt, scraped_at=scraped_at, pokemon_name=slug,
                        rank=entry["rank"], win_rate=entry.get("win_rate"),
                        record=entry.get("record"),
                    ))
                db.commit()
                total_snapshots = db.query(UsageSnapshot).filter(UsageSnapshot.format == fmt).count()
                distinct_runs = (
                    db.query(UsageSnapshot.scraped_at)
                    .filter(UsageSnapshot.format == fmt)
                    .distinct()
                    .count()
                )
                print(f"Recorded snapshot {scraped_at} "
                      f"({total_snapshots} rows across {distinct_runs} run(s)).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
