from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import json

from app.database import get_db
from app.models.pokemon import Pokemon, Move, PokemonUsageStats
from app.schemas import (
    DamageCalcRequest, DamageCalcResult, SurvivalRequest, SurvivalResult,
    TeamMatchupRequest, TeamMatchupRow, MatchupCell,
    VersusRequest, VersusPair, VersusSide, VersusMoveResult,
)
from app.damage_calc import Combatant, compute_damage
from app.natures_data import MAX_EV_PER_STAT, EV_TOTAL_BUDGET

router = APIRouter(prefix="/api/calc", tags=["calc"])


def _load_pokemon(db: Session, name: str) -> Pokemon:
    pokemon = db.query(Pokemon).filter(Pokemon.name == name.lower().replace(" ", "-")).first()
    if not pokemon:
        raise HTTPException(status_code=404, detail=f"Pokemon '{name}' not found")
    return pokemon


def _to_combatant(pokemon: Pokemon, spec) -> Combatant:
    base_stats = {
        "hp": pokemon.hp, "atk": pokemon.attack, "def": pokemon.defense,
        "spa": pokemon.special_attack, "spd": pokemon.special_defense, "spe": pokemon.speed,
    }
    types = [pokemon.type1, pokemon.type2]
    return Combatant(
        base_stats=base_stats, types=types, evs=spec.evs, nature=spec.nature,
        ability=spec.ability, item=spec.item, level=spec.level, stages=spec.stages,
        status=spec.status, current_hp_percent=spec.current_hp_percent,
        type_override=spec.type_override,
    )


@router.post("/damage", response_model=DamageCalcResult)
def calc_damage(req: DamageCalcRequest, db: Session = Depends(get_db)):
    attacker_pokemon = _load_pokemon(db, req.attacker.pokemon_name)
    defender_pokemon = _load_pokemon(db, req.defender.pokemon_name)

    move = db.query(Move).filter(Move.name == req.move_name.lower().replace(" ", "-")).first()
    if not move:
        raise HTTPException(status_code=404, detail=f"Move '{req.move_name}' not found")

    attacker = _to_combatant(attacker_pokemon, req.attacker)
    defender = _to_combatant(defender_pokemon, req.defender)

    result = compute_damage(
        attacker, defender,
        move={"type": move.type, "category": move.category, "power": move.power},
        field=req.field.model_dump(),
    )
    return result


@router.post("/survive", response_model=SurvivalResult)
def calc_survival(req: SurvivalRequest, db: Session = Depends(get_db)):
    """Find the cheapest HP + Def/SpD EV investment that survives the given
    attack's worst-case (highest) damage roll with at least
    `survive_at_hp_percent` of max HP remaining.

    Searches every legal (hp_ev, def_ev) pair within the 66-point budget and
    returns the one with the smallest total spend. The search space is tiny
    (33 x 33 at most), so brute force is fine and avoids approximation.
    """
    attacker_pokemon = _load_pokemon(db, req.attacker.pokemon_name)
    defender_pokemon = _load_pokemon(db, req.defender.pokemon_name)

    move = db.query(Move).filter(Move.name == req.move_name.lower().replace(" ", "-")).first()
    if not move:
        raise HTTPException(status_code=404, detail=f"Move '{req.move_name}' not found")
    if move.category == "status" or not move.power:
        return SurvivalResult(found=False, reason="That move deals no direct damage.")

    attacker = _to_combatant(attacker_pokemon, req.attacker)
    move_dict = {"type": move.type, "category": move.category, "power": move.power}

    # Which defensive stat the move actually targets.
    def_stat_key = "def" if move.category == "physical" else "spd"

    hp_range = [req.fixed_hp_ev] if req.fixed_hp_ev is not None else range(0, MAX_EV_PER_STAT + 1)
    def_range = [req.fixed_def_ev] if req.fixed_def_ev is not None else range(0, MAX_EV_PER_STAT + 1)

    best = None
    for hp_ev in hp_range:
        for def_ev in def_range:
            if hp_ev + def_ev > EV_TOTAL_BUDGET:
                continue
            total = hp_ev + def_ev
            if best is not None and total >= best["total"]:
                continue  # already have a cheaper spread

            evs = {**req.defender.evs, "hp": hp_ev, def_stat_key: def_ev}
            candidate = _to_combatant(defender_pokemon, req.defender)
            candidate.evs = evs

            result = compute_damage(attacker, candidate, move_dict, field=req.field.model_dump())
            if result.get("error"):
                return SurvivalResult(found=False, reason=result["error"])
            if result.get("immune"):
                return SurvivalResult(
                    found=True, hp_ev=0, def_ev=0, def_stat_key=def_stat_key, total_evs=0,
                    worst_case_damage=0, worst_case_percent=0.0,
                    resulting_hp=candidate.stat("hp"),
                    reason=result.get("reason"),
                )

            max_hp = candidate.stat("hp")
            worst_damage = result["dmg_high"]
            hp_left_percent = (max_hp - worst_damage) / max_hp * 100
            if hp_left_percent >= req.survive_at_hp_percent:
                best = {
                    "total": total, "hp_ev": hp_ev, "def_ev": def_ev,
                    "damage": worst_damage, "percent": result["pct_high"], "hp": max_hp,
                }

    if not best:
        return SurvivalResult(
            found=False,
            reason=f"No legal EV spread survives this attack with {req.survive_at_hp_percent}% HP remaining.",
        )

    return SurvivalResult(
        found=True,
        hp_ev=best["hp_ev"],
        def_ev=best["def_ev"],
        def_stat_key=def_stat_key,
        total_evs=best["total"],
        worst_case_damage=best["damage"],
        worst_case_percent=best["percent"],
        resulting_hp=best["hp"],
    )


def _build_combatant(pokemon: Pokemon, evs=None, nature="hardy", ability="", item="", level=50) -> Combatant:
    base_stats = {
        "hp": pokemon.hp, "atk": pokemon.attack, "def": pokemon.defense,
        "spa": pokemon.special_attack, "spd": pokemon.special_defense, "spe": pokemon.speed,
    }
    return Combatant(
        base_stats=base_stats, types=[pokemon.type1, pokemon.type2],
        evs=evs or {}, nature=nature, ability=ability, item=item, level=level,
    )


class _MetaTarget:
    """A top-usage Pokemon set up with its real most-used ability and move."""

    def __init__(self, pokemon, rank, top_move, top_ability, top_item):
        self.pokemon = pokemon
        self.rank = rank
        self.top_move = top_move        # Move row, or None
        self.top_ability = top_ability  # ability slug, or ""
        self.top_item = top_item        # item slug, or ""


def _resolve_top_set(db: Session, row: PokemonUsageStats):
    """Resolve a usage row's most-used ability/item/damaging move against our
    own data. Returns (top_move, ability_slug, item_slug)."""
    pokemon = row.pokemon

    # Walk the move usage list in order and take the first actual damaging
    # move - the #1 entry is often a status move (Protect, Tailwind), which
    # tells us nothing about how hard this Pokemon hits.
    top_move = None
    for entry in json.loads(row.moves_json or "[]"):
        candidate = next(
            (m for m in pokemon.moves if m.display_name.lower() == entry["name"].lower()),
            None,
        )
        if candidate and candidate.category != "status" and candidate.power:
            top_move = candidate
            break

    ability_slug = ""
    abilities = json.loads(row.abilities_json or "[]")
    if abilities:
        match = next(
            (a for a in pokemon.abilities if a.display_name.lower() == abilities[0]["name"].lower()),
            None,
        )
        if match:
            ability_slug = match.name

    item_slug = ""
    items = json.loads(row.items_json or "[]")
    if items:
        from app.models.pokemon import Item
        match = db.query(Item).filter(Item.display_name.ilike(items[0]["name"])).first()
        if match:
            item_slug = match.name

    return top_move, ability_slug, item_slug


def _load_meta_pool(db: Session, pool_size: int):
    """The top N Pokemon by real usage, each with their most-used set."""
    rows = (
        db.query(PokemonUsageStats)
        .order_by(PokemonUsageStats.rank)
        .limit(pool_size)
        .all()
    )

    targets = []
    for row in rows:
        if not row.pokemon:
            continue
        top_move, ability, item = _resolve_top_set(db, row)
        targets.append(_MetaTarget(row.pokemon, row.rank, top_move, ability, item))
    return targets


@router.post("/team-matchups", response_model=list[TeamMatchupRow])
def calc_team_matchups(req: TeamMatchupRequest, db: Session = Depends(get_db)):
    """Full Breaker/Waller matrix: every team member against every top-usage
    Pokemon, in both directions.

    Computed server-side in one request because doing it in the browser would
    need hundreds of round-trips (team size x pool size x moves).
    """
    pool = _load_meta_pool(db, req.pool_size)
    field = req.field.model_dump()
    rows = []

    for member in req.team:
        pokemon = _load_pokemon(db, member.pokemon_name)
        attacker = _build_combatant(
            pokemon, evs=member.evs, nature=member.nature,
            ability=member.ability or "", item=member.item or "", level=member.level,
        )

        selected_moves = [
            m for m in pokemon.moves
            if m.name in member.moves and m.category != "status" and m.power
        ]

        cells, dealt_values, taken_values = [], [], []
        ko_count = survives_count = 0

        for target in pool:
            target_combatant = _build_combatant(
                target.pokemon, ability=target.top_ability, item=target.top_item,
            )

            # Offense: our best selected move against this target.
            best_move_name, best_pct = None, None
            for move in selected_moves:
                result = compute_damage(
                    attacker, target_combatant,
                    move={"type": move.type, "category": move.category, "power": move.power},
                    field=field,
                )
                if result.get("error") or result.get("immune"):
                    continue
                pct = result.get("pct_high") or 0
                if best_pct is None or pct > best_pct:
                    best_pct, best_move_name = pct, move.display_name
            if best_pct is not None:
                dealt_values.append(best_pct)
                if best_pct >= 100:
                    ko_count += 1

            # Defense: their most-used damaging move against us.
            taken_pct, incoming_name = None, None
            if target.top_move:
                incoming = compute_damage(
                    target_combatant, attacker,
                    move={
                        "type": target.top_move.type,
                        "category": target.top_move.category,
                        "power": target.top_move.power,
                    },
                    field=field,
                )
                if not incoming.get("error") and not incoming.get("immune"):
                    taken_pct = incoming.get("pct_high")
                    incoming_name = target.top_move.display_name
                    taken_values.append(taken_pct or 0)
                    if (taken_pct or 0) < 100:
                        survives_count += 1

            cells.append(MatchupCell(
                target_name=target.pokemon.name,
                target_display_name=target.pokemon.display_name,
                target_sprite=target.pokemon.sprite_url,
                target_rank=target.rank,
                best_move=best_move_name,
                damage_dealt_pct=round(best_pct, 1) if best_pct is not None else None,
                incoming_move=incoming_name,
                damage_taken_pct=round(taken_pct, 1) if taken_pct is not None else None,
            ))

        rows.append(TeamMatchupRow(
            pokemon_name=pokemon.name,
            display_name=pokemon.display_name,
            sprite_url=pokemon.sprite_url,
            avg_damage_dealt=round(sum(dealt_values) / len(dealt_values), 1) if dealt_values else None,
            avg_damage_taken=round(sum(taken_values) / len(taken_values), 1) if taken_values else None,
            ko_count=ko_count,
            survives_count=survives_count,
            cells=cells,
        ))

    return rows


# --- Meta Calcs -----------------------------------------------------------
#
# All four Meta Calcs modes (Team -> 1, 1 -> Team, 1 -> Meta, Meta -> 1) ask
# the same question: how do these attackers fare against these defenders. One
# endpoint serves all of them; the caller decides what goes on each side and
# pages the meta pool itself.

NATURE_BOOSTS = {
    "adamant": ("atk", "spa"), "modest": ("spa", "atk"), "jolly": ("spe", "spa"),
    "timid": ("spe", "atk"), "brave": ("atk", "spe"), "quiet": ("spa", "spe"),
    "bold": ("def", "atk"), "impish": ("def", "spa"), "calm": ("spd", "atk"),
    "careful": ("spd", "spa"), "relaxed": ("def", "spe"), "sassy": ("spd", "spe"),
    "hasty": ("spe", "def"), "naive": ("spe", "spd"), "lonely": ("atk", "def"),
    "naughty": ("atk", "spd"), "mild": ("spa", "def"), "rash": ("spa", "spd"),
    "gentle": ("spd", "def"), "lax": ("def", "spd"),
}

_STAT_LABELS = {"hp": "HP", "atk": "Atk", "def": "Def", "spa": "SpA", "spd": "SpD", "spe": "Spe"}


def _ev_label(evs: dict, stat: str, nature: str) -> str:
    """"32 Atk", or "32+ Atk" when the nature boosts it - the way every damage
    calculator writes a spread."""
    value = (evs or {}).get(stat, 0)
    boosted, hindered = NATURE_BOOSTS.get((nature or "").lower(), (None, None))
    mark = "+" if stat == boosted else ("-" if stat == hindered else "")
    return f"{value}{mark} {_STAT_LABELS[stat]}"


def _item_label(db: Session, slug) -> str:
    if not slug:
        return ""
    from app.models.pokemon import Item
    item = db.query(Item).filter(Item.name == slug).first()
    return f"{item.display_name} " if item else ""


def _verdict_for(pct_high, ko_text, immune: bool) -> str:
    """Green when the attack genuinely threatens, red when it does nothing,
    amber in between - roughly how a player reads a calc at a glance."""
    if immune or not pct_high:
        return "bad"
    if pct_high >= 100 or (ko_text and "OHKO" in ko_text):
        return "good"
    if pct_high >= 50:
        return "warning"
    return "bad"


@router.post("/versus", response_model=list[VersusPair])
def calc_versus(req: VersusRequest, db: Session = Depends(get_db)):
    field = req.field.model_dump()
    pairs = []

    for atk_spec in req.attackers:
        atk_pokemon = _load_pokemon(db, atk_spec.pokemon_name)
        attacker = _build_combatant(
            atk_pokemon, evs=atk_spec.evs, nature=atk_spec.nature,
            ability=atk_spec.ability or "", item=atk_spec.item or "", level=atk_spec.level,
        )
        atk_item_label = _item_label(db, atk_spec.item)
        moves = [m for m in atk_pokemon.moves if m.name in atk_spec.moves]

        for def_spec in req.defenders:
            def_pokemon = _load_pokemon(db, def_spec.pokemon_name)
            defender = _build_combatant(
                def_pokemon, evs=def_spec.evs, nature=def_spec.nature,
                ability=def_spec.ability or "", item=def_spec.item or "", level=def_spec.level,
            )

            atk_speed, def_speed = attacker.stat("spe"), defender.stat("spe")
            results = []

            for move in moves:
                if move.category == "status" or not move.power:
                    continue
                result = compute_damage(
                    attacker, defender,
                    move={"type": move.type, "category": move.category, "power": move.power},
                    field=field,
                )
                if result.get("error"):
                    continue

                immune = bool(result.get("immune"))
                offence_stat = "atk" if move.category == "physical" else "spa"
                defence_stat = "def" if move.category == "physical" else "spd"
                attacker_label = (
                    f"{_ev_label(atk_spec.evs, offence_stat, atk_spec.nature)} "
                    f"{atk_item_label}{atk_pokemon.display_name} {move.display_name}"
                )

                if immune:
                    description = f"{attacker_label} vs. {def_pokemon.display_name}: immune"
                else:
                    description = (
                        f"{attacker_label} vs. "
                        f"{_ev_label(def_spec.evs, 'hp', def_spec.nature)} / "
                        f"{_ev_label(def_spec.evs, defence_stat, def_spec.nature)} "
                        f"{def_pokemon.display_name}: "
                        f"{result['dmg_low']}-{result['dmg_high']} "
                        f"({result['pct_low']} - {result['pct_high']}%)"
                    )

                results.append(VersusMoveResult(
                    move_name=move.name,
                    move_display_name=move.display_name,
                    description=description,
                    ko_text=result.get("ko_text"),
                    pct_low=result.get("pct_low"),
                    pct_high=result.get("pct_high"),
                    verdict=_verdict_for(result.get("pct_high"), result.get("ko_text"), immune),
                    immune=immune,
                ))

            pairs.append(VersusPair(
                attacker=VersusSide(
                    pokemon_name=atk_pokemon.name, display_name=atk_pokemon.display_name,
                    sprite_url=atk_pokemon.sprite_url, speed=atk_speed,
                    moves_first=atk_speed > def_speed,
                ),
                defender=VersusSide(
                    pokemon_name=def_pokemon.name, display_name=def_pokemon.display_name,
                    sprite_url=def_pokemon.sprite_url, speed=def_speed,
                    moves_first=def_speed > atk_speed,
                ),
                results=results,
            ))

    return pairs


@router.get("/meta-pool")
def get_meta_pool(offset: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    """The ranked meta as ready-to-use calc targets, paged.

    Each entry carries its most-used set, so calcs run against what people
    actually bring rather than a blank Pokemon with no item or EVs.
    """
    total = db.query(PokemonUsageStats).count()
    rows = (
        db.query(PokemonUsageStats)
        .order_by(PokemonUsageStats.rank)
        .offset(offset)
        .limit(limit)
        .all()
    )

    entries = []
    for row in rows:
        if not row.pokemon:
            continue
        _, ability, item = _resolve_top_set(db, row)
        spreads = json.loads(row.spreads_json or "[]")
        top_spread = spreads[0] if spreads else {}
        top_move_names = {m["name"].lower() for m in json.loads(row.moves_json or "[]")[:4]}
        entries.append({
            "pokemon_name": row.pokemon.name,
            "display_name": row.pokemon.display_name,
            "sprite_url": row.pokemon.sprite_url,
            "rank": row.rank,
            # Base speed so the frontend can build a speed ladder without a
            # second request per Pokemon.
            "base_speed": row.pokemon.speed,
            "ability": ability,
            "item": item,
            "nature": top_spread.get("nature", "hardy"),
            "evs": top_spread.get("evs", {}),
            "moves": [m.name for m in row.pokemon.moves if m.display_name.lower() in top_move_names],
        })

    return {"total": total, "items": entries}
