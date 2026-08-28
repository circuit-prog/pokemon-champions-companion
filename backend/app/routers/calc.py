from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.pokemon import Pokemon, Move
from app.schemas import DamageCalcRequest, DamageCalcResult
from app.damage_calc import Combatant, compute_damage

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
