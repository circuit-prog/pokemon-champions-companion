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
    effect: Optional[str] = None


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
    """Shape for list views (search table, team builder picker) - includes
    base stats and ability names so the search table can sort/display them
    without a second request per Pokemon."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    display_name: str
    type1: str
    type2: Optional[str]
    sprite_url: Optional[str]
    hp: int
    attack: int
    defense: int
    special_attack: int
    special_defense: int
    speed: int
    abilities: List[str] = []


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
    status: str = "healthy"  # healthy/burn/paralysis/poison/badly-poisoned/sleep/freeze
    current_hp_percent: float = 100.0
    type_override: Optional[List[str]] = None  # manually change this Pokemon's types


class DamageCalcField(BaseModel):
    crit: bool = False
    weather: str = "none"  # none/sun/rain/sand/snow
    terrain: str = "none"  # none/electric/grassy/misty/psychic
    reflect: bool = False
    lightscreen: bool = False
    helping_hand: bool = False
    friend_guard: bool = False
    doubles: bool = False
    spread_move: bool = False  # in doubles, does this move hit multiple targets?


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
    defender_current_hp: Optional[int] = None
    rolls: Optional[List[int]] = None  # the 16 possible damage values
    ko_text: Optional[str] = None
    ko_chance_percent: Optional[float] = None
    type_effectiveness: Optional[float] = None
    stab: Optional[float] = None


class SurvivalRequest(BaseModel):
    """Solve for the cheapest EV spread that survives an attack.

    Mirrors DamageCalcRequest, but the defender's HP/Def/SpD EVs are what we
    solve for rather than take as input.
    """
    attacker: CombatantIn
    defender: CombatantIn
    move_name: str
    field: DamageCalcField = DamageCalcField()
    survive_at_hp_percent: float = 1.0  # survive with at least this much HP left
    fixed_hp_ev: Optional[int] = None   # optionally pin one of the stats
    fixed_def_ev: Optional[int] = None


class SurvivalResult(BaseModel):
    found: bool
    reason: Optional[str] = None
    hp_ev: Optional[int] = None
    def_ev: Optional[int] = None
    def_stat_key: Optional[str] = None  # "def" or "spd", whichever the move targets
    total_evs: Optional[int] = None
    worst_case_damage: Optional[int] = None
    worst_case_percent: Optional[float] = None
    resulting_hp: Optional[int] = None


class UsageEntry(BaseModel):
    name: str
    percent: Optional[float] = None


class PokemonUsageOut(BaseModel):
    """Real Pokemon Champions tournament usage data for one Pokemon.
    Only exists for the subset of Pokemon actually seen in tracked play."""
    format: str
    rank: int
    usage_percent: Optional[float]
    win_rate: Optional[float] = None
    record: Optional[str] = None
    moves: List[UsageEntry]
    items: List[UsageEntry]
    abilities: List[UsageEntry]
    teammates: List[UsageEntry] = []


class TeamMemberIn(BaseModel):
    """One of your team's Pokemon, for the Breaker/Waller matchup matrix."""
    pokemon_name: str
    evs: dict = {}
    nature: str = "hardy"
    ability: Optional[str] = None
    item: Optional[str] = None
    level: int = 50
    moves: List[str] = []  # move slugs currently selected on this Pokemon


class TeamMatchupRequest(BaseModel):
    team: List[TeamMemberIn]
    pool_size: int = 25  # how many top-usage Pokemon to test against
    field: DamageCalcField = DamageCalcField()


class MatchupCell(BaseModel):
    """How one of your Pokemon fares against one meta Pokemon, both ways."""
    target_name: str
    target_display_name: str
    target_sprite: Optional[str]
    target_rank: int
    best_move: Optional[str] = None          # your best move against them
    damage_dealt_pct: Optional[float] = None
    incoming_move: Optional[str] = None      # their most-used move
    damage_taken_pct: Optional[float] = None


class TeamMatchupRow(BaseModel):
    pokemon_name: str
    display_name: str
    sprite_url: Optional[str]
    avg_damage_dealt: Optional[float]
    avg_damage_taken: Optional[float]
    ko_count: int = 0        # how many of the pool this Pokemon can OHKO
    survives_count: int = 0  # how many of the pool it survives a hit from
    cells: List[MatchupCell]


class TeamCoreOut(BaseModel):
    """A Pokemon combination that frequently appears together on real teams."""
    size: int
    rank: int
    pokemon: List[str]
    sprites: List[Optional[str]]
    teams: Optional[int]
    usage_percent: Optional[float]


class TopTeamOut(BaseModel):
    """A high-performing team from a recent tracked tournament."""
    rank: int
    author: Optional[str]
    record: Optional[str]
    tournament: Optional[str]
    pokemon: List[str]
    sprites: List[Optional[str]]


class UsageTrendPoint(BaseModel):
    scraped_at: str
    rank: int
    win_rate: Optional[float]


class MetaRankingEntry(BaseModel):
    """One row of the meta usage leaderboard - lighter than PokemonUsageOut
    (no per-move/item/ability breakdown) for listing many Pokemon at once."""
    rank: int
    name: str
    display_name: str
    sprite_url: Optional[str]
    type1: str
    type2: Optional[str]
    usage_percent: Optional[float]
    win_rate: Optional[float] = None
