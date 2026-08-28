import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.pokemon import Pokemon, PokemonUsageStats, TeamCore, TopTeam, UsageSnapshot
from app.schemas import MetaRankingEntry, TeamCoreOut, TopTeamOut, UsageTrendPoint

router = APIRouter(prefix="/api/meta", tags=["meta"])


def _sprite_map(db: Session, display_names: set) -> dict:
    """Map Pikalytics display names (e.g. 'Charizard-Mega-Y') to sprite URLs.
    Their naming uses hyphens where PokeAPI slugs do too, so a lowercase
    hyphenated lookup covers most cases; unmatched names just get no sprite."""
    slugs = {n: n.lower().replace(" ", "-") for n in display_names}
    found = db.query(Pokemon).filter(Pokemon.name.in_(list(slugs.values()))).all()
    by_slug = {p.name: p.sprite_url for p in found}
    return {name: by_slug.get(slug) for name, slug in slugs.items()}


@router.get("/rankings", response_model=list[MetaRankingEntry])
def get_meta_rankings(db: Session = Depends(get_db)):
    """The full real Pokemon Champions usage leaderboard (currently ~83
    Pokemon - only what's actually been seen in tracked tournament play)."""
    rows = db.query(PokemonUsageStats).order_by(PokemonUsageStats.rank).all()
    return [
        MetaRankingEntry(
            rank=r.rank,
            name=r.pokemon.name,
            display_name=r.pokemon.display_name,
            sprite_url=r.pokemon.sprite_url,
            type1=r.pokemon.type1,
            type2=r.pokemon.type2,
            usage_percent=r.usage_percent,
            win_rate=r.win_rate,
        )
        for r in rows
    ]


@router.get("/cores", response_model=list[TeamCoreOut])
def get_team_cores(
    size: int = Query(0, description="Filter to 2/3/4-Pokemon cores; 0 = all sizes"),
    db: Session = Depends(get_db),
):
    """Pokemon combinations that most often appear together on real teams."""
    query = db.query(TeamCore)
    if size:
        query = query.filter(TeamCore.size == size)
    rows = query.order_by(TeamCore.size, TeamCore.rank).all()

    all_names = {n for r in rows for n in json.loads(r.pokemon_json)}
    sprites = _sprite_map(db, all_names)

    return [
        TeamCoreOut(
            size=r.size, rank=r.rank,
            pokemon=json.loads(r.pokemon_json),
            sprites=[sprites.get(n) for n in json.loads(r.pokemon_json)],
            teams=r.teams, usage_percent=r.usage_percent,
        )
        for r in rows
    ]


@router.get("/top-teams", response_model=list[TopTeamOut])
def get_top_teams(
    contains: str = Query("", description="Only teams featuring this Pokemon (display name, case-insensitive)"),
    db: Session = Depends(get_db),
):
    """Recent high-performing teams from tracked tournaments."""
    rows = db.query(TopTeam).order_by(TopTeam.rank).all()
    if contains:
        needle = contains.lower()
        rows = [r for r in rows if any(needle in n.lower() for n in json.loads(r.pokemon_json))]

    all_names = {n for r in rows for n in json.loads(r.pokemon_json)}
    sprites = _sprite_map(db, all_names)

    return [
        TopTeamOut(
            rank=r.rank, author=r.author, record=r.record, tournament=r.tournament,
            pokemon=json.loads(r.pokemon_json),
            sprites=[sprites.get(n) for n in json.loads(r.pokemon_json)],
        )
        for r in rows
    ]


@router.get("/trend/{name}", response_model=list[UsageTrendPoint])
def get_usage_trend(name: str, db: Session = Depends(get_db)):
    """Usage rank / win rate over time for one Pokemon. Only has data from
    scrape runs we've recorded ourselves - Pikalytics publishes current data
    only, so early on this will be a single point."""
    rows = (
        db.query(UsageSnapshot)
        .filter(UsageSnapshot.pokemon_name == name.lower())
        .order_by(UsageSnapshot.scraped_at)
        .all()
    )
    return [
        UsageTrendPoint(scraped_at=r.scraped_at, rank=r.rank, win_rate=r.win_rate)
        for r in rows
    ]
