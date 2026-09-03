import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_, case

from app.database import get_db
from app.models.pokemon import Pokemon, PokemonUsageStats, Ability
from app.name_resolver import resolve_names
from app.schemas import PokemonSummary, PokemonDetail, PokemonUsageOut, UsageEntry, SpreadEntry

router = APIRouter(prefix="/api/pokemon", tags=["pokemon"])


def _to_summary(p: Pokemon) -> PokemonSummary:
    return PokemonSummary(
        id=p.id, name=p.name, display_name=p.display_name,
        type1=p.type1, type2=p.type2, sprite_url=p.sprite_url,
        hp=p.hp, attack=p.attack, defense=p.defense,
        special_attack=p.special_attack, special_defense=p.special_defense, speed=p.speed,
        abilities=[a.display_name for a in p.abilities],
    )


# Sorting happens here rather than in the browser. The frontend used to sort
# whatever page it happened to have, which meant "sort by Attack" only ever
# reordered the top 100 by usage - Pokemon outside that window (Falinks-Mega,
# most Megas, anything not in the meta) could never appear however you sorted.
_BST = (
    Pokemon.hp + Pokemon.attack + Pokemon.defense
    + Pokemon.special_attack + Pokemon.special_defense + Pokemon.speed
)

SORT_COLUMNS = {
    "name": Pokemon.display_name,
    "hp": Pokemon.hp,
    "attack": Pokemon.attack,
    "defense": Pokemon.defense,
    "special_attack": Pokemon.special_attack,
    "special_defense": Pokemon.special_defense,
    "speed": Pokemon.speed,
    "bst": _BST,
}


# One entry per base stat the frontend can filter on with min_X / max_X.
_STAT_COLUMNS = {
    "hp": Pokemon.hp,
    "attack": Pokemon.attack,
    "defense": Pokemon.defense,
    "special_attack": Pokemon.special_attack,
    "special_defense": Pokemon.special_defense,
    "speed": Pokemon.speed,
}


@router.get("", response_model=list[PokemonSummary])
def list_pokemon(
    response: Response,
    search: Optional[str] = Query(None, description="Filter by name, case-insensitive substring match"),
    types: Optional[str] = Query(None, description="Comma-separated types; matches Pokemon with ANY of these types"),
    ability: Optional[str] = Query(None, description="Filter to Pokemon that can have an ability matching this substring"),
    min_hp: Optional[int] = Query(None), max_hp: Optional[int] = Query(None),
    min_attack: Optional[int] = Query(None), max_attack: Optional[int] = Query(None),
    min_defense: Optional[int] = Query(None), max_defense: Optional[int] = Query(None),
    min_special_attack: Optional[int] = Query(None), max_special_attack: Optional[int] = Query(None),
    min_special_defense: Optional[int] = Query(None), max_special_defense: Optional[int] = Query(None),
    min_speed: Optional[int] = Query(None), max_speed: Optional[int] = Query(None),
    sort: str = Query("usage", description="usage | name | hp | attack | defense | special_attack | special_defense | speed | bst"),
    order: str = Query("", description="asc | desc; defaults to whatever suits the sort column"),
    limit: int = Query(100, le=2000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Browse or search the dex.

    Supports the Showdown-style multi-field search the team builder promised
    but the Pokedex never delivered: name text, one or more types, an ability
    substring, and min/max thresholds on any base stat, all combinable in one
    request rather than name-only.

    Returns the total number of matches in the X-Total-Count header so the
    frontend can page through everything rather than silently showing a
    truncated slice.
    """
    query = (
        db.query(Pokemon)
        .outerjoin(PokemonUsageStats, PokemonUsageStats.pokemon_id == Pokemon.id)
    )
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(or_(Pokemon.name.ilike(like), Pokemon.display_name.ilike(like)))

    if types:
        wanted = [t.strip().lower() for t in types.split(",") if t.strip()]
        if wanted:
            query = query.filter(or_(Pokemon.type1.in_(wanted), Pokemon.type2.in_(wanted)))

    if ability:
        like = f"%{ability.lower()}%"
        query = query.filter(Pokemon.abilities.any(Ability.display_name.ilike(like)))

    stat_bounds = {
        "hp": (min_hp, max_hp),
        "attack": (min_attack, max_attack),
        "defense": (min_defense, max_defense),
        "special_attack": (min_special_attack, max_special_attack),
        "special_defense": (min_special_defense, max_special_defense),
        "speed": (min_speed, max_speed),
    }
    for stat_name, (lo, hi) in stat_bounds.items():
        column = _STAT_COLUMNS[stat_name]
        if lo is not None:
            query = query.filter(column >= lo)
        if hi is not None:
            query = query.filter(column <= hi)

    # A many-to-many ability filter can duplicate rows if a Pokemon matches on
    # more than one ability - dedupe before counting/paging.
    if ability:
        query = query.distinct()

    total = query.count()

    if sort == "usage" or sort not in SORT_COLUMNS:
        # Real tracked-usage Pokemon first (most-used first), then everyone
        # else - so browsing surfaces what's actually relevant right now.
        # "desc" flips the rank order within the tracked group (worst-first
        # instead of best-first) and the name tiebreak, but untracked
        # Pokemon stay last either way - they're not "worse", they're just
        # not comparable, so flipping them to the front on desc would be
        # wrong. (Reversing the *list order* instead of each key's own
        # direction - the previous bug - collapsed this into a plain
        # alphabetical sort, since the tiebreak column ended up sorted
        # before the rank column.)
        untracked_last = case((PokemonUsageStats.rank.is_(None), 1), else_=0)
        if order == "desc":
            ordering = [untracked_last, PokemonUsageStats.rank.desc(), Pokemon.display_name.desc()]
        else:
            ordering = [untracked_last, PokemonUsageStats.rank.asc(), Pokemon.display_name.asc()]
    else:
        column = SORT_COLUMNS[sort]
        # Stats read most naturally highest-first; names A-Z.
        descending = (order or ("asc" if sort == "name" else "desc")) == "desc"
        ordering = [column.desc() if descending else column.asc(), Pokemon.display_name.asc()]

    query = query.order_by(*ordering)

    response.headers["X-Total-Count"] = str(total)
    return [_to_summary(p) for p in query.offset(offset).limit(limit).all()]


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

    # Teammates carry their dex slug and sprite so the frontend can add one
    # straight to a team - their display names ("Floette-Eternal") don't map
    # to our slugs by simple lowercasing in every case.
    teammates = json.loads(stats.teammates_json)
    resolved = resolve_names(db, {t["name"] for t in teammates})
    teammate_entries = [
        UsageEntry(
            name=t["name"],
            percent=t.get("percent"),
            slug=resolved.get(t["name"], (None, None))[0],
            sprite_url=resolved.get(t["name"], (None, None))[1],
        )
        for t in teammates
    ]

    return PokemonUsageOut(
        format=stats.format,
        rank=stats.rank,
        usage_percent=stats.usage_percent,
        win_rate=stats.win_rate,
        record=stats.record,
        moves=json.loads(stats.moves_json),
        items=json.loads(stats.items_json),
        abilities=json.loads(stats.abilities_json),
        teammates=teammate_entries,
        spreads=[SpreadEntry(**s) for s in json.loads(stats.spreads_json or "[]")],
    )
