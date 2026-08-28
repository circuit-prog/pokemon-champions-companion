import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models.pokemon import Pokemon, PokemonUsageStats
from app.schemas import PokemonSummary, PokemonDetail, PokemonUsageOut

router = APIRouter(prefix="/api/pokemon", tags=["pokemon"])


@router.get("", response_model=list[PokemonSummary])
def list_pokemon(
    search: Optional[str] = Query(None, description="Filter by name, case-insensitive substring match"),
    limit: int = Query(50, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(Pokemon)
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(or_(Pokemon.name.ilike(like), Pokemon.display_name.ilike(like)))
    return query.order_by(Pokemon.id).limit(limit).all()


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
        moves=json.loads(stats.moves_json),
        items=json.loads(stats.items_json),
        abilities=json.loads(stats.abilities_json),
    )
