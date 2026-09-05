"""Admin-entered tournament results: CRUD for Tournament/TournamentResult,
plus browsing (list, detail with auto-computed "most brought", and a
cross-tournament Pokemon search).

No auth - this whole app is single-user and localhost-only (see every other
router), and the interview that scoped this feature confirmed that's fine.
"""
import json
from collections import Counter
from typing import Dict, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.pokemon import Pokemon
from app.models.tournament import Tournament, TournamentResult
from app.schemas import (
    MostBroughtEntry,
    TournamentDetailOut,
    TournamentIn,
    TournamentResultIn,
    TournamentResultOut,
    TournamentRosterSlotOut,
    TournamentSearchHit,
    TournamentStatEntry,
    TournamentSummaryOut,
)

router = APIRouter(prefix="/api/tournaments", tags=["tournaments"])

MOST_BROUGHT_COUNT = 10


def _sprite_lookup(db: Session, names: Set[str]) -> Dict[str, Tuple[str, Optional[str]]]:
    """Our own dex slugs (not scraped display names, so no fuzzy matching
    needed) -> (display_name, sprite_url)."""
    rows = db.query(Pokemon).filter(Pokemon.name.in_(names)).all()
    return {p.name: (p.display_name, p.sprite_url) for p in rows}


def _roster_out(db: Session, roster_json: str) -> list[TournamentRosterSlotOut]:
    slots = json.loads(roster_json)
    lookup = _sprite_lookup(db, {s["pokemon_name"] for s in slots})
    out = []
    for s in slots:
        display_name, sprite_url = lookup.get(s["pokemon_name"], (s["pokemon_name"], None))
        out.append(TournamentRosterSlotOut(**s, display_name=display_name, sprite_url=sprite_url))
    return out


def _result_out(db: Session, result: TournamentResult) -> TournamentResultOut:
    return TournamentResultOut(
        id=result.id,
        placement=result.placement,
        player=result.player,
        roster=_roster_out(db, result.roster_json),
        notes=result.notes,
        is_dark_horse=result.is_dark_horse,
        player_external_id=result.player_external_id,
        prize_money=result.prize_money,
        points=result.points,
    )


def _get_tournament(db: Session, tournament_id: int) -> Tournament:
    tournament = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail=f"Tournament {tournament_id} not found")
    return tournament


def _get_result(db: Session, tournament_id: int, result_id: int) -> TournamentResult:
    result = (
        db.query(TournamentResult)
        .filter(TournamentResult.id == result_id, TournamentResult.tournament_id == tournament_id)
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail=f"Result {result_id} not found")
    return result


@router.get("", response_model=list[TournamentSummaryOut])
def list_tournaments(db: Session = Depends(get_db)):
    tournaments = db.query(Tournament).order_by(Tournament.date.desc()).all()
    return [
        TournamentSummaryOut(
            id=t.id,
            name=t.name,
            date=t.date,
            format=t.format,
            player_count=t.player_count,
            result_count=len(t.results),
        )
        for t in tournaments
    ]


@router.get("/search", response_model=list[TournamentSearchHit])
def search_tournaments_by_pokemon(pokemon: str, db: Session = Depends(get_db)):
    """Every result, across every tournament, whose roster includes this
    Pokemon (matched by our dex slug)."""
    hits = []
    results = db.query(TournamentResult).join(Tournament).all()
    for r in results:
        names = {s["pokemon_name"] for s in json.loads(r.roster_json)}
        if pokemon in names:
            hits.append(
                TournamentSearchHit(
                    tournament_id=r.tournament_id,
                    tournament_name=r.tournament.name,
                    tournament_date=r.tournament.date,
                    result_id=r.id,
                    player=r.player,
                    placement=r.placement,
                    roster=_roster_out(db, r.roster_json),
                )
            )
    hits.sort(key=lambda h: h.tournament_date, reverse=True)
    return hits


@router.get("/{tournament_id}", response_model=TournamentDetailOut)
def get_tournament(tournament_id: int, db: Session = Depends(get_db)):
    t = _get_tournament(db, tournament_id)
    results = sorted(t.results, key=lambda r: r.placement)

    counts: Counter[str] = Counter()
    for r in results:
        for slot in json.loads(r.roster_json):
            counts[slot["pokemon_name"]] += 1
    top_names = [name for name, _ in counts.most_common(MOST_BROUGHT_COUNT)]
    lookup = _sprite_lookup(db, set(top_names))
    most_brought = [
        MostBroughtEntry(
            pokemon_name=name,
            display_name=lookup.get(name, (name, None))[0],
            sprite_url=lookup.get(name, (name, None))[1],
            count=counts[name],
        )
        for name in top_names
    ]

    tournament_stats = []
    if t.stats_json:
        raw_stats = json.loads(t.stats_json)
        stats_lookup = _sprite_lookup(db, {s["pokemon_name"] for s in raw_stats})
        for s in raw_stats:
            display_name, sprite_url = stats_lookup.get(s["pokemon_name"], (s["pokemon_name"], None))
            tournament_stats.append(
                TournamentStatEntry(
                    pokemon_name=s["pokemon_name"],
                    display_name=display_name,
                    sprite_url=sprite_url,
                    count=s["count"],
                    share_percent=s.get("share_percent"),
                    points=s.get("points"),
                )
            )

    return TournamentDetailOut(
        id=t.id,
        name=t.name,
        date=t.date,
        format=t.format,
        player_count=t.player_count,
        source_url=t.source_url,
        notes=t.notes,
        results=[_result_out(db, r) for r in results],
        most_brought=most_brought,
        tournament_stats=tournament_stats,
    )


@router.post("", response_model=TournamentSummaryOut)
def create_tournament(body: TournamentIn, db: Session = Depends(get_db)):
    t = Tournament(**body.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return TournamentSummaryOut(
        id=t.id, name=t.name, date=t.date, format=t.format, player_count=t.player_count, result_count=0
    )


@router.put("/{tournament_id}", response_model=TournamentSummaryOut)
def update_tournament(tournament_id: int, body: TournamentIn, db: Session = Depends(get_db)):
    t = _get_tournament(db, tournament_id)
    for field, value in body.model_dump().items():
        setattr(t, field, value)
    db.commit()
    db.refresh(t)
    return TournamentSummaryOut(
        id=t.id, name=t.name, date=t.date, format=t.format, player_count=t.player_count, result_count=len(t.results)
    )


@router.delete("/{tournament_id}")
def delete_tournament(tournament_id: int, db: Session = Depends(get_db)):
    t = _get_tournament(db, tournament_id)
    db.delete(t)  # cascades to results (relationship cascade="all, delete-orphan")
    db.commit()
    return {"deleted": True}


@router.post("/{tournament_id}/results", response_model=TournamentResultOut)
def add_result(tournament_id: int, body: TournamentResultIn, db: Session = Depends(get_db)):
    _get_tournament(db, tournament_id)  # 404 if the tournament doesn't exist
    result = TournamentResult(
        tournament_id=tournament_id,
        placement=body.placement,
        player=body.player,
        roster_json=json.dumps([slot.model_dump() for slot in body.roster]),
        notes=body.notes,
        is_dark_horse=body.is_dark_horse,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return _result_out(db, result)


@router.put("/{tournament_id}/results/{result_id}", response_model=TournamentResultOut)
def update_result(tournament_id: int, result_id: int, body: TournamentResultIn, db: Session = Depends(get_db)):
    result = _get_result(db, tournament_id, result_id)
    result.placement = body.placement
    result.player = body.player
    result.roster_json = json.dumps([slot.model_dump() for slot in body.roster])
    result.notes = body.notes
    result.is_dark_horse = body.is_dark_horse
    db.commit()
    db.refresh(result)
    return _result_out(db, result)


@router.delete("/{tournament_id}/results/{result_id}")
def delete_result(tournament_id: int, result_id: int, db: Session = Depends(get_db)):
    result = _get_result(db, tournament_id, result_id)
    db.delete(result)
    db.commit()
    return {"deleted": True}
