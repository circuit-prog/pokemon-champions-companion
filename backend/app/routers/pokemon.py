from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models.pokemon import Pokemon
from app.schemas import PokemonSummary, PokemonDetail

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
