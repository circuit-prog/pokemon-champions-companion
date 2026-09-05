"""Player career stats and tournament history, scraped alongside tournament
results from limitlessvgc.com's own player pages. Read-only - Player rows
only ever come from the scraper, never the admin form."""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.tournament import Player, Tournament, TournamentResult
from app.routers.tournaments import _roster_out
from app.schemas import PlayerDetailOut, PlayerOut, PlayerResultOut

router = APIRouter(prefix="/api/players", tags=["players"])


def _player_out(p: Player) -> PlayerOut:
    return PlayerOut(
        external_id=p.external_id,
        name=p.name,
        country=p.country,
        money_won=p.money_won,
        points_earned=p.points_earned,
        top_cuts=json.loads(p.top_cuts_json) if p.top_cuts_json else {},
    )


@router.get("", response_model=list[PlayerOut])
def list_players(db: Session = Depends(get_db)):
    players = db.query(Player).order_by(Player.points_earned.desc().nullslast()).all()
    return [_player_out(p) for p in players]


@router.get("/{external_id}", response_model=PlayerDetailOut)
def get_player(external_id: str, db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.external_id == external_id).first()
    if not player:
        raise HTTPException(status_code=404, detail=f"Player '{external_id}' not found")

    rows = (
        db.query(TournamentResult, Tournament)
        .join(Tournament, TournamentResult.tournament_id == Tournament.id)
        .filter(TournamentResult.player_external_id == external_id)
        .order_by(Tournament.date.desc())
        .all()
    )
    results = [
        PlayerResultOut(
            tournament_id=t.id,
            tournament_name=t.name,
            tournament_date=t.date,
            placement=r.placement,
            prize_money=r.prize_money,
            points=r.points,
            roster=_roster_out(db, r.roster_json),
        )
        for r, t in rows
    ]

    base = _player_out(player)
    return PlayerDetailOut(**base.model_dump(), results=results)
