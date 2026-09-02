"""Read-only lookups for moves, items, and abilities.

Used both by the team builder's in-context pickers (small, name-only
searches) and by the standalone Moves/Abilities/Items browser pages, which
need real filtering (move type, category, power) and paging, plus a reverse
lookup - "which Pokemon actually learn this" - that the pickers never needed
because they already start from one Pokemon.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.pokemon import Move, Item, Ability, Pokemon, PokemonUsageStats
from app.schemas import MoveOut, ItemOut, AbilityOut, PokemonSummary

router = APIRouter(prefix="/api", tags=["reference"])


def _to_pokemon_summary(p: Pokemon) -> PokemonSummary:
    return PokemonSummary(
        id=p.id, name=p.name, display_name=p.display_name,
        type1=p.type1, type2=p.type2, sprite_url=p.sprite_url,
        hp=p.hp, attack=p.attack, defense=p.defense,
        special_attack=p.special_attack, special_defense=p.special_defense, speed=p.speed,
        abilities=[a.display_name for a in p.abilities],
    )


@router.get("/moves", response_model=list[MoveOut])
def list_moves(
    response: Response,
    search: Optional[str] = Query(None, description="Matches name or effect text"),
    type: Optional[str] = Query(None),
    category: Optional[str] = Query(None, description="physical | special | status"),
    min_power: Optional[int] = Query(None),
    max_power: Optional[int] = Query(None),
    limit: int = Query(50, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Showdown-style move search: filter by name/effect text, type,
    category and power range, all combinable - the standalone Moves browser
    needs this even though the in-context move picker never did."""
    query = db.query(Move)
    if search:
        like = f"%{search}%"
        query = query.filter((Move.display_name.ilike(like)) | (Move.effect.ilike(like)))
    if type:
        query = query.filter(Move.type == type.lower())
    if category:
        query = query.filter(Move.category == category.lower())
    if min_power is not None:
        query = query.filter(Move.power >= min_power)
    if max_power is not None:
        query = query.filter(Move.power <= max_power)

    response.headers["X-Total-Count"] = str(query.count())
    return query.order_by(Move.name).offset(offset).limit(limit).all()


@router.get("/moves/{name}/learners", response_model=list[PokemonSummary])
def get_move_learners(
    name: str,
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
):
    """Which Pokemon actually learn this move - the reverse lookup a move
    browser needs that "search moves for one Pokemon" never does. Tracked
    (ranked) Pokemon come first since that's almost always what you're
    actually asking."""
    move = db.query(Move).filter(Move.name == name.lower()).first()
    if not move:
        raise HTTPException(status_code=404, detail=f"Move '{name}' not found")

    learners = (
        db.query(Pokemon)
        .join(Pokemon.moves.and_(Move.id == move.id))
        .outerjoin(PokemonUsageStats, PokemonUsageStats.pokemon_id == Pokemon.id)
        .order_by(PokemonUsageStats.rank.is_(None), PokemonUsageStats.rank, Pokemon.display_name)
        .limit(limit)
        .all()
    )
    return [_to_pokemon_summary(p) for p in learners]


@router.get("/items", response_model=list[ItemOut])
def list_items(
    response: Response,
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Item)
    if search:
        like = f"%{search}%"
        query = query.filter((Item.display_name.ilike(like)) | (Item.effect.ilike(like)))
    response.headers["X-Total-Count"] = str(query.count())
    return query.order_by(Item.name).offset(offset).limit(limit).all()


@router.get("/abilities", response_model=list[AbilityOut])
def list_abilities(
    response: Response,
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Ability)
    if search:
        like = f"%{search}%"
        query = query.filter((Ability.display_name.ilike(like)) | (Ability.effect.ilike(like)))
    response.headers["X-Total-Count"] = str(query.count())
    return query.order_by(Ability.name).offset(offset).limit(limit).all()


@router.get("/abilities/{name}/pokemon", response_model=list[PokemonSummary])
def get_ability_holders(
    name: str,
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
):
    """Which Pokemon can have this ability - the same reverse-lookup need as
    moves, so you can go from "what does Levitate do" to "who has it"."""
    ability = db.query(Ability).filter(Ability.name == name.lower()).first()
    if not ability:
        raise HTTPException(status_code=404, detail=f"Ability '{name}' not found")

    holders = (
        db.query(Pokemon)
        .join(Pokemon.abilities.and_(Ability.id == ability.id))
        .outerjoin(PokemonUsageStats, PokemonUsageStats.pokemon_id == Pokemon.id)
        .order_by(PokemonUsageStats.rank.is_(None), PokemonUsageStats.rank, Pokemon.display_name)
        .limit(limit)
        .all()
    )
    return [_to_pokemon_summary(p) for p in holders]
