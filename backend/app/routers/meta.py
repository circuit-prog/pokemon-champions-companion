from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.pokemon import PokemonUsageStats
from app.schemas import MetaRankingEntry

router = APIRouter(prefix="/api/meta", tags=["meta"])


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
        )
        for r in rows
    ]
