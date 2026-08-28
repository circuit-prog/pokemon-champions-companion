"""Read-only lookups for moves, items, and abilities (used by team builder dropdowns)."""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.pokemon import Move, Item, Ability
from app.schemas import MoveOut, ItemOut, AbilityOut

router = APIRouter(prefix="/api", tags=["reference"])


@router.get("/moves", response_model=list[MoveOut])
def list_moves(search: Optional[str] = Query(None), limit: int = Query(50, le=500), db: Session = Depends(get_db)):
    query = db.query(Move)
    if search:
        query = query.filter(Move.display_name.ilike(f"%{search}%"))
    return query.order_by(Move.name).limit(limit).all()


@router.get("/items", response_model=list[ItemOut])
def list_items(search: Optional[str] = Query(None), limit: int = Query(50, le=500), db: Session = Depends(get_db)):
    query = db.query(Item)
    if search:
        query = query.filter(Item.display_name.ilike(f"%{search}%"))
    return query.order_by(Item.name).limit(limit).all()


@router.get("/abilities", response_model=list[AbilityOut])
def list_abilities(search: Optional[str] = Query(None), limit: int = Query(50, le=500), db: Session = Depends(get_db)):
    query = db.query(Ability)
    if search:
        query = query.filter(Ability.display_name.ilike(f"%{search}%"))
    return query.order_by(Ability.name).limit(limit).all()
