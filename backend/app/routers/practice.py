"""The user's own logged practice games - Phase 4. No auth (see every other
router - this whole app is single-user and localhost-only).

An opponent's roster is never stored directly: it's derived from the
distinct opponent_pokemon/opponent_switch_in values already logged across a
game's turns, so "add Pokemon as revealed" falls out of turn-logging for
free instead of needing its own endpoint that could drift out of sync.
"""
import json
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.practice import PracticeGame, PracticeTurn
from app.routers.tournaments import _sprite_lookup
from app.schemas import (
    PracticeDamageLeader,
    PracticeGameIn,
    PracticeGameOut,
    PracticeGameSummaryOut,
    PracticeGameUpdateIn,
    PracticePokemonStat,
    PracticeRosterSlotOut,
    PracticeStatsOut,
    PracticeStreak,
    PracticeTeamStat,
    PracticeTrendPoint,
    PracticeTurnIn,
    PracticeTurnOut,
)

router = APIRouter(prefix="/api/practice", tags=["practice"])


def _opponent_roster_names(game: PracticeGame) -> List[str]:
    seen: List[str] = []
    for t in game.turns:
        for name in (
            t.opponent_pokemon, t.opponent_switch_in,
            t.opponent_pokemon_b, t.opponent_switch_in_b,
        ):
            if name and name not in seen:
                seen.append(name)
    return seen


def _roster_slots(db: Session, names: List[str]) -> List[PracticeRosterSlotOut]:
    lookup = _sprite_lookup(db, set(names))
    return [
        PracticeRosterSlotOut(
            pokemon_name=name,
            display_name=lookup.get(name, (name, None))[0],
            sprite_url=lookup.get(name, (name, None))[1],
        )
        for name in names
    ]


def _game_summary(db: Session, game: PracticeGame) -> PracticeGameSummaryOut:
    return PracticeGameSummaryOut(
        id=game.id,
        date=game.date,
        my_team_name=game.my_team_name,
        result=game.result,
        mode=game.mode or "singles",
        turn_count=len(game.turns),
        opponent_roster=_roster_slots(db, _opponent_roster_names(game)),
    )


def _turn_out(db: Session, t: PracticeTurn) -> PracticeTurnOut:
    names = {
        t.my_pokemon, t.my_switch_in, t.opponent_pokemon, t.opponent_switch_in,
        t.my_pokemon_b, t.my_switch_in_b, t.opponent_pokemon_b, t.opponent_switch_in_b,
    }
    names.discard(None)
    lookup = _sprite_lookup(db, names)

    def resolved(name: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
        if not name:
            return None, None
        return lookup.get(name, (name, None))

    my_display, my_sprite = resolved(t.my_pokemon)
    my_switch_display, my_switch_sprite = resolved(t.my_switch_in)
    opp_display, opp_sprite = resolved(t.opponent_pokemon)
    opp_switch_display, opp_switch_sprite = resolved(t.opponent_switch_in)
    my_b_display, my_b_sprite = resolved(t.my_pokemon_b)
    my_switch_b_display, my_switch_b_sprite = resolved(t.my_switch_in_b)
    opp_b_display, opp_b_sprite = resolved(t.opponent_pokemon_b)
    opp_switch_b_display, opp_switch_b_sprite = resolved(t.opponent_switch_in_b)

    return PracticeTurnOut(
        id=t.id,
        turn_number=t.turn_number,
        my_pokemon=t.my_pokemon,
        my_move=t.my_move,
        my_damage=t.my_damage,
        my_fainted=t.my_fainted,
        my_switch_in=t.my_switch_in,
        opponent_pokemon=t.opponent_pokemon,
        opponent_move=t.opponent_move,
        opponent_damage=t.opponent_damage,
        opponent_fainted=t.opponent_fainted,
        opponent_switch_in=t.opponent_switch_in,
        my_pokemon_b=t.my_pokemon_b,
        my_move_b=t.my_move_b,
        my_damage_b=t.my_damage_b,
        my_fainted_b=t.my_fainted_b,
        my_switch_in_b=t.my_switch_in_b,
        opponent_pokemon_b=t.opponent_pokemon_b,
        opponent_move_b=t.opponent_move_b,
        opponent_damage_b=t.opponent_damage_b,
        opponent_fainted_b=t.opponent_fainted_b,
        opponent_switch_in_b=t.opponent_switch_in_b,
        my_pokemon_b_display_name=my_b_display,
        my_pokemon_b_sprite_url=my_b_sprite,
        my_switch_in_b_display_name=my_switch_b_display,
        my_switch_in_b_sprite_url=my_switch_b_sprite,
        opponent_pokemon_b_display_name=opp_b_display,
        opponent_pokemon_b_sprite_url=opp_b_sprite,
        opponent_switch_in_b_display_name=opp_switch_b_display,
        opponent_switch_in_b_sprite_url=opp_switch_b_sprite,
        field_notes=t.field_notes,
        my_pokemon_display_name=my_display,
        my_pokemon_sprite_url=my_sprite,
        my_switch_in_display_name=my_switch_display,
        my_switch_in_sprite_url=my_switch_sprite,
        opponent_pokemon_display_name=opp_display,
        opponent_pokemon_sprite_url=opp_sprite,
        opponent_switch_in_display_name=opp_switch_display,
        opponent_switch_in_sprite_url=opp_switch_sprite,
    )


def _game_out(db: Session, game: PracticeGame) -> PracticeGameOut:
    summary = _game_summary(db, game)
    return PracticeGameOut(
        **summary.model_dump(),
        my_roster=_roster_slots(db, json.loads(game.my_roster_json)),
        notes=game.notes,
        replay_link=game.replay_link,
        turns=[_turn_out(db, t) for t in game.turns],
    )


def _get_game(db: Session, game_id: int) -> PracticeGame:
    game = db.query(PracticeGame).filter(PracticeGame.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail=f"Practice game {game_id} not found")
    return game


def _get_turn(db: Session, game_id: int, turn_number: int) -> PracticeTurn:
    turn = (
        db.query(PracticeTurn)
        .filter(PracticeTurn.game_id == game_id, PracticeTurn.turn_number == turn_number)
        .first()
    )
    if not turn:
        raise HTTPException(status_code=404, detail=f"Turn {turn_number} not found")
    return turn


@router.get("", response_model=List[PracticeGameSummaryOut])
def list_practice_games(
    opponent: Optional[str] = None,
    team: Optional[str] = None,
    result: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    mode: Optional[str] = None,
    db: Session = Depends(get_db),
):
    games = db.query(PracticeGame).order_by(PracticeGame.date.desc(), PracticeGame.id.desc()).all()
    out = []
    for g in games:
        if team and g.my_team_name != team:
            continue
        if result and g.result != result:
            continue
        if mode and (g.mode or "singles") != mode:
            continue
        if date_from and g.date < date_from:
            continue
        if date_to and g.date > date_to:
            continue
        if opponent:
            if opponent not in _opponent_roster_names(g):
                continue
        out.append(_game_summary(db, g))
    return out


@router.get("/stats", response_model=PracticeStatsOut)
def get_practice_stats(mode: Optional[str] = None, db: Session = Depends(get_db)):
    games = (
        db.query(PracticeGame)
        .filter(PracticeGame.result.isnot(None))
        .order_by(PracticeGame.date.asc(), PracticeGame.id.asc())
        .all()
    )
    if mode:
        games = [g for g in games if (g.mode or "singles") == mode]
    if not games:
        return PracticeStatsOut()

    # Streaks, in chronological order.
    current_type: Optional[str] = None
    current_len = 0
    best_win_streak = 0
    running_win_streak = 0
    for g in games:
        if g.result == current_type:
            current_len += 1
        else:
            current_type = g.result
            current_len = 1
        if g.result == "win":
            running_win_streak += 1
            best_win_streak = max(best_win_streak, running_win_streak)
        else:
            running_win_streak = 0
    current_streak = PracticeStreak(type=current_type, length=current_len)

    # By-team win rate.
    team_totals: Dict[str, Dict[str, int]] = {}
    for g in games:
        t = team_totals.setdefault(g.my_team_name, {"games": 0, "wins": 0})
        t["games"] += 1
        if g.result == "win":
            t["wins"] += 1
    by_team = [
        PracticeTeamStat(
            team_name=name, games=t["games"], wins=t["wins"], win_rate=round(100 * t["wins"] / t["games"], 1)
        )
        for name, t in sorted(team_totals.items(), key=lambda kv: kv[1]["games"], reverse=True)
    ]

    # Cumulative win-rate trend.
    over_time = []
    wins_so_far = 0
    for i, g in enumerate(games, start=1):
        if g.result == "win":
            wins_so_far += 1
        over_time.append(
            PracticeTrendPoint(
                game_id=g.id, date=g.date, result=g.result, win_rate_so_far=round(100 * wins_so_far / i, 1)
            )
        )

    # Vs-opponent-Pokemon and by-own-Pokemon win rates.
    vs_opponent_totals: Dict[str, Dict[str, int]] = {}
    own_totals: Dict[str, Dict[str, int]] = {}
    damage_totals: Dict[str, Dict[str, int]] = {}
    for g in games:
        won = g.result == "win"
        for name in set(_opponent_roster_names(g)):
            t = vs_opponent_totals.setdefault(name, {"games": 0, "wins": 0})
            t["games"] += 1
            if won:
                t["wins"] += 1
        my_names = set(json.loads(g.my_roster_json))
        for name in my_names:
            t = own_totals.setdefault(name, {"games": 0, "wins": 0})
            t["games"] += 1
            if won:
                t["wins"] += 1
        for t in g.turns:
            for mon, dmg in ((t.my_pokemon, t.my_damage), (t.my_pokemon_b, t.my_damage_b)):
                if not mon or not dmg:
                    continue
                d = damage_totals.setdefault(mon, {"big_hits": 0, "total_hits": 0})
                d["total_hits"] += 1
                if dmg == "big":
                    d["big_hits"] += 1

    def pokemon_stats(totals: Dict[str, Dict[str, int]]) -> List[PracticePokemonStat]:
        lookup = _sprite_lookup(db, set(totals.keys()))
        stats = [
            PracticePokemonStat(
                pokemon_name=name,
                display_name=lookup.get(name, (name, None))[0],
                sprite_url=lookup.get(name, (name, None))[1],
                games=t["games"],
                wins=t["wins"],
                win_rate=round(100 * t["wins"] / t["games"], 1),
            )
            for name, t in totals.items()
        ]
        stats.sort(key=lambda s: s.games, reverse=True)
        return stats

    lookup = _sprite_lookup(db, set(damage_totals.keys()))
    damage_leaders = [
        PracticeDamageLeader(
            pokemon_name=name,
            display_name=lookup.get(name, (name, None))[0],
            sprite_url=lookup.get(name, (name, None))[1],
            big_hits=d["big_hits"],
            total_hits=d["total_hits"],
        )
        for name, d in damage_totals.items()
    ]
    damage_leaders.sort(key=lambda d: (d.big_hits, d.total_hits), reverse=True)

    return PracticeStatsOut(
        current_streak=current_streak,
        best_win_streak=best_win_streak,
        by_team=by_team,
        over_time=over_time,
        vs_opponent_pokemon=pokemon_stats(vs_opponent_totals),
        by_own_pokemon=pokemon_stats(own_totals),
        damage_leaders=damage_leaders,
    )


@router.post("", response_model=PracticeGameOut)
def create_practice_game(body: PracticeGameIn, db: Session = Depends(get_db)):
    game = PracticeGame(
        date=body.date,
        my_team_name=body.my_team_name,
        my_roster_json=json.dumps(body.my_roster),
        notes=body.notes,
        replay_link=body.replay_link,
        mode=body.mode if body.mode in ("singles", "doubles") else "singles",
    )
    db.add(game)
    db.commit()
    db.refresh(game)
    return _game_out(db, game)


@router.get("/{game_id}", response_model=PracticeGameOut)
def get_practice_game(game_id: int, db: Session = Depends(get_db)):
    return _game_out(db, _get_game(db, game_id))


@router.put("/{game_id}", response_model=PracticeGameOut)
def update_practice_game(game_id: int, body: PracticeGameUpdateIn, db: Session = Depends(get_db)):
    game = _get_game(db, game_id)
    if body.result is not None:
        game.result = body.result
    if body.replay_link is not None:
        game.replay_link = body.replay_link
    if body.notes is not None:
        game.notes = body.notes
    db.commit()
    db.refresh(game)
    return _game_out(db, game)


@router.delete("/{game_id}")
def delete_practice_game(game_id: int, db: Session = Depends(get_db)):
    game = _get_game(db, game_id)
    db.delete(game)
    db.commit()
    return {"deleted": True}


@router.post("/{game_id}/turns", response_model=PracticeTurnOut)
def add_practice_turn(game_id: int, body: PracticeTurnIn, db: Session = Depends(get_db)):
    game = _get_game(db, game_id)
    next_number = len(game.turns) + 1
    turn = PracticeTurn(game_id=game_id, turn_number=next_number, **body.model_dump())
    db.add(turn)
    db.commit()
    db.refresh(turn)
    return _turn_out(db, turn)


@router.put("/{game_id}/turns/{turn_number}", response_model=PracticeTurnOut)
def update_practice_turn(game_id: int, turn_number: int, body: PracticeTurnIn, db: Session = Depends(get_db)):
    turn = _get_turn(db, game_id, turn_number)
    for field, value in body.model_dump().items():
        setattr(turn, field, value)
    db.commit()
    db.refresh(turn)
    return _turn_out(db, turn)


@router.delete("/{game_id}/turns/{turn_number}")
def delete_practice_turn(game_id: int, turn_number: int, db: Session = Depends(get_db)):
    turn = _get_turn(db, game_id, turn_number)
    db.delete(turn)
    db.commit()
    return {"deleted": True}
