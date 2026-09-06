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
    TournamentTrendPoint,
    PokemonStatsOut,
    PokemonSetOptionEntry,
    PokemonTeammateEntry,
)

router = APIRouter(prefix="/api/tournaments", tags=["tournaments"])

MOST_BROUGHT_COUNT = 10

# Auto-detected team archetypes/playstyles, keyed by tag -> (abilities, moves)
# that signal it. A team only needs one member with a matching ability or
# move to earn the tag - this is a heuristic over already-logged sets, not
# a claim about how the team was actually piloted.
ARCHETYPE_RULES: list[tuple[str, Set[str], Set[str]]] = [
    ("Trick Room", set(), {"trick-room"}),
    ("Tailwind", set(), {"tailwind"}),
    ("Rain", {"drizzle"}, {"rain-dance"}),
    ("Sun", {"drought"}, {"sunny-day"}),
    ("Sand", {"sand-stream"}, {"sandstorm"}),
    ("Snow", {"snow-warning"}, {"snowscape", "hail"}),
    ("Screens", set(), {"light-screen", "reflect", "aurora-veil"}),
    ("Electric Terrain", {"electric-surge", "hadron-engine"}, {"electric-terrain"}),
    ("Psychic Terrain", {"psychic-surge"}, {"psychic-terrain"}),
    ("Grassy Terrain", {"grassy-surge"}, {"grassy-terrain"}),
    ("Misty Terrain", {"misty-surge"}, {"misty-terrain"}),
]


def _team_archetypes(roster: list[dict]) -> list[str]:
    abilities = {s["ability"] for s in roster if s.get("ability")}
    moves: Set[str] = set()
    for s in roster:
        moves.update(s.get("moves", []))
    tags = [
        tag
        for tag, ability_set, move_set in ARCHETYPE_RULES
        if (ability_set & abilities) or (move_set & moves)
    ]
    return tags


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
        record=result.record,
        archetypes=_team_archetypes(json.loads(result.roster_json)),
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
    out = []
    for t in tournaments:
        tags: Set[str] = set()
        for r in t.results:
            tags.update(_team_archetypes(json.loads(r.roster_json)))
        out.append(
            TournamentSummaryOut(
                id=t.id,
                name=t.name,
                date=t.date,
                format=t.format,
                player_count=t.player_count,
                result_count=len(t.results),
                is_online=t.is_online,
                archetypes=sorted(tags),
            )
        )
    return out


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


@router.get("/trend", response_model=list[TournamentTrendPoint])
def get_pokemon_trend(pokemon: str, db: Session = Depends(get_db)):
    """One Pokemon's usage % across every tracked tournament, oldest first -
    is it trending up or down? Computed entirely from results already in
    the DB (no new scraping), one point per tournament that has at least
    one result, including tournaments where the Pokemon didn't appear at
    all (0%), so a gap in usage is visible rather than silently skipped."""
    tournaments = db.query(Tournament).order_by(Tournament.date.asc()).all()
    points = []
    for t in tournaments:
        total = len(t.results)
        if total == 0:
            continue
        count = sum(
            1 for r in t.results if pokemon in {s["pokemon_name"] for s in json.loads(r.roster_json)}
        )
        points.append(
            TournamentTrendPoint(
                tournament_id=t.id,
                tournament_name=t.name,
                tournament_date=t.date,
                count=count,
                total_results=total,
                usage_percent=round(100 * count / total, 1),
            )
        )
    return points


@router.get("/stats", response_model=PokemonStatsOut)
def get_pokemon_stats(pokemon: str, db: Session = Depends(get_db)):
    """Everything derivable about one Pokemon from results already logged:
    its most common teammates, its most common item/ability/nature/moves,
    and how it tends to place - all computed live, no extra scraping."""
    results = db.query(TournamentResult).join(Tournament).all()
    by_tournament: Dict[int, list[TournamentResult]] = {}
    for r in results:
        by_tournament.setdefault(r.tournament_id, []).append(r)

    teammate_counter: Counter[str] = Counter()
    counter_counter: Counter[str] = Counter()
    counters_sample_size = 0
    item_counter: Counter[str] = Counter()
    ability_counter: Counter[str] = Counter()
    nature_counter: Counter[str] = Counter()
    move_counter: Counter[str] = Counter()
    placements: list[int] = []
    best_placement: Optional[int] = None
    best_placement_tournament: Optional[str] = None
    top_4 = 0
    top_8 = 0

    for r in results:
        slots = json.loads(r.roster_json)
        names = {s["pokemon_name"] for s in slots}
        if pokemon not in names:
            continue
        placements.append(r.placement)
        # Approximate "counters": Pokemon on teams that placed above this
        # team in the same tournament. Not real head-to-head battle data
        # (no bracket/pairing info is available), just a proxy signal.
        for beater in by_tournament.get(r.tournament_id, []):
            if beater.placement >= r.placement:
                continue
            counters_sample_size += 1
            for slot in json.loads(beater.roster_json):
                counter_counter[slot["pokemon_name"]] += 1
        if best_placement is None or r.placement < best_placement:
            best_placement = r.placement
            best_placement_tournament = r.tournament.name
        if r.placement <= 4:
            top_4 += 1
        if r.placement <= 8:
            top_8 += 1
        for s in slots:
            if s["pokemon_name"] == pokemon:
                if s.get("item"):
                    item_counter[s["item"]] += 1
                if s.get("ability"):
                    ability_counter[s["ability"]] += 1
                if s.get("nature"):
                    nature_counter[s["nature"]] += 1
                for mv in s.get("moves", []):
                    move_counter[mv] += 1
            else:
                teammate_counter[s["pokemon_name"]] += 1

    appearances = len(placements)
    if appearances == 0:
        return PokemonStatsOut(pokemon_name=pokemon, appearances=0)

    def top_entries(counter: Counter[str], limit: int) -> list[PokemonSetOptionEntry]:
        return [
            PokemonSetOptionEntry(name=name, count=c, percent=round(100 * c / appearances, 1))
            for name, c in counter.most_common(limit)
        ]

    teammate_lookup = _sprite_lookup(db, set(teammate_counter.keys()))
    teammates = [
        PokemonTeammateEntry(
            pokemon_name=name,
            display_name=teammate_lookup.get(name, (name, None))[0],
            sprite_url=teammate_lookup.get(name, (name, None))[1],
            count=c,
            percent=round(100 * c / appearances, 1),
        )
        for name, c in teammate_counter.most_common(10)
    ]

    counter_lookup = _sprite_lookup(db, set(counter_counter.keys()))
    counters = [
        PokemonTeammateEntry(
            pokemon_name=name,
            display_name=counter_lookup.get(name, (name, None))[0],
            sprite_url=counter_lookup.get(name, (name, None))[1],
            count=c,
            percent=round(100 * c / counters_sample_size, 1) if counters_sample_size else 0.0,
        )
        for name, c in counter_counter.most_common(10)
        if name != pokemon
    ]

    return PokemonStatsOut(
        pokemon_name=pokemon,
        appearances=appearances,
        teammates=teammates,
        counters=counters,
        counters_sample_size=counters_sample_size,
        items=top_entries(item_counter, 5),
        abilities=top_entries(ability_counter, 5),
        natures=top_entries(nature_counter, 5),
        moves=top_entries(move_counter, 8),
        average_placement=round(sum(placements) / len(placements), 1),
        best_placement=best_placement,
        best_placement_tournament=best_placement_tournament,
        top_4_finishes=top_4,
        top_8_finishes=top_8,
    )


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
        is_online=t.is_online,
    )


@router.post("", response_model=TournamentSummaryOut)
def create_tournament(body: TournamentIn, db: Session = Depends(get_db)):
    t = Tournament(**body.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return TournamentSummaryOut(
        id=t.id, name=t.name, date=t.date, format=t.format, player_count=t.player_count, result_count=0,
        is_online=t.is_online,
    )


@router.put("/{tournament_id}", response_model=TournamentSummaryOut)
def update_tournament(tournament_id: int, body: TournamentIn, db: Session = Depends(get_db)):
    t = _get_tournament(db, tournament_id)
    for field, value in body.model_dump().items():
        setattr(t, field, value)
    db.commit()
    db.refresh(t)
    return TournamentSummaryOut(
        id=t.id, name=t.name, date=t.date, format=t.format, player_count=t.player_count,
        result_count=len(t.results), is_online=t.is_online,
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
