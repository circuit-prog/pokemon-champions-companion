from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.pokemon import Pokemon, Move
from app.schemas import DamageCalcRequest, DamageCalcResult, SurvivalRequest, SurvivalResult
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
