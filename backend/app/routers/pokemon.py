import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, case

from app.database import get_db
from app.models.pokemon import Pokemon, PokemonUsageStats
from app.schemas import PokemonSummary, PokemonDetail, PokemonUsageOut

router = APIRouter(prefix="/api/pokemon", tags=["pokemon"])


def _to_summary(p: Pokemon) -> PokemonSummary:
    return PokemonSummary(
        id=p.id, name=p.name, display_name=p.display_name,
        type1=p.type1, type2=p.type2, sprite_url=p.sprite_url,
        hp=p.hp, attack=p.attack, defense=p.defense,
        special_attack=p.special_attack, special_defense=p.special_defense, speed=p.speed,
        abilities=[a.display_name for a in p.abilities],
    )


@router.get("", response_model=list[PokemonSummary])
def list_pokemon(
    search: Optional[str] = Query(None, description="Filter by name, case-insensitive substring match"),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
):
    # Order real tracked-usage Pokemon first (most-used first), then everyone
    # else - so search/browse surfaces what's actually relevant in the
    # current meta instead of raw national-dex order.
    query = (
        db.query(Pokemon)
        .outerjoin(PokemonUsageStats, PokemonUsageStats.pokemon_id == Pokemon.id)
    )
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(or_(Pokemon.name.ilike(like), Pokemon.display_name.ilike(like)))
    query = query.order_by(
        case((PokemonUsageStats.rank.is_(None), 1), else_=0),
        PokemonUsageStats.rank.asc(),
        Pokemon.display_name.asc(),
    )
    return [_to_summary(p) for p in query.limit(limit).all()]


@router.get("/{name}", response_model=PokemonDetail)
def get_pokemon(name: str, db: Session = Depends(get_db)):
    pokemon = db.query(Pokemon).filter(Pokemon.name == name.lower()).first()
    if not pokemon:
        raise HTTPException(status_code=404, detail=f"Pokemon '{name}' not found")
    return pokemon


@router.get("/{name}/usage", response_model=PokemonUsageOut)
def get_pokemon_usage(name: str, db: Session = Depends(get_db)):
    """Real Pokemon Champions tournament usage data, if this Pokemon has any
    (only ~83 Pokemon do, as of writing - the competitive meta is still small)."""
    pokemon = db.query(Pokemon).filter(Pokemon.name == name.lower()).first()
    if not pokemon:
        raise HTTPException(status_code=404, detail=f"Pokemon '{name}' not found")

    stats = db.query(PokemonUsageStats).filter(PokemonUsageStats.pokemon_id == pokemon.id).first()
    if not stats:
        raise HTTPException(status_code=404, detail=f"No usage data for '{name}' (not seen in tracked tournaments)")

    return PokemonUsageOut(
        format=stats.format,
        rank=stats.rank,
        usage_percent=stats.usage_percent,
        win_rate=stats.win_rate,
        record=stats.record,
        moves=json.loads(stats.moves_json),
        items=json.loads(stats.items_json),
        abilities=json.loads(stats.abilities_json),
        teammates=json.loads(stats.teammates_json),
    )
