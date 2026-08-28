"""Pydantic schemas: define the shape of JSON the API sends back to the frontend."""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class MoveOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    display_name: str
    type: str
    category: str
    power: Optional[int]
    accuracy: Optional[int]
    pp: Optional[int]


class AbilityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    display_name: str
    effect: Optional[str]


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    display_name: str
    sprite_url: Optional[str]
    effect: Optional[str]


class PokemonSummary(BaseModel):
    """Lightweight shape for list views (search, team builder picker)."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    display_name: str
    type1: str
    type2: Optional[str]
    sprite_url: Optional[str]


class PokemonDetail(PokemonSummary):
    """Full shape for a single Pokemon's page, including stats/moves/abilities."""
    hp: int
    attack: int
    defense: int
    special_attack: int
    special_defense: int
    speed: int
    moves: List[MoveOut]
    abilities: List[AbilityOut]


class CombatantIn(BaseModel):
    """One side (attacker or defender) of a damage calc request."""
    pokemon_name: str
    evs: dict = {}  # {"hp": 0, "atk": 31, "def": 0, "spa": 0, "spd": 0, "spe": 31}
    nature: str = "hardy"
    ability: Optional[str] = None
    item: Optional[str] = None
    level: int = 50
    stages: dict = {}  # e.g. {"atk": 1} for a +1 Attack boost


class DamageCalcField(BaseModel):
    crit: bool = False
    weather: str = "none"  # none/sun/rain/sand/snow
    reflect: bool = False
    lightscreen: bool = False
    burn: bool = False


class DamageCalcRequest(BaseModel):
    attacker: CombatantIn
    defender: CombatantIn
    move_name: str
    field: DamageCalcField = DamageCalcField()


class DamageCalcResult(BaseModel):
    error: Optional[str] = None
    immune: Optional[bool] = None
    reason: Optional[str] = None
    dmg_low: Optional[int] = None
    dmg_high: Optional[int] = None
    pct_low: Optional[float] = None
    pct_high: Optional[float] = None
    defender_hp: Optional[int] = None
    ko_text: Optional[str] = None
    type_effectiveness: Optional[float] = None
    stab: Optional[float] = None
