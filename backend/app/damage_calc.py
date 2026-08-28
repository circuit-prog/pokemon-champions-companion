"""Damage calculation engine.

Ported from the prior project's app.js (~/GameProjects/pokemon), which
implemented the standard Gen 6+ damage formula plus common competitive
modifiers (items, abilities, weather, terrain, screens). Kept in Python here
so both the API and any future scraper/analysis scripts can share one
source of truth for damage math, instead of duplicating it in JS.

Not simulated: multi-turn effects, status conditions beyond burn, and the
full 16-roll damage spread (we only compute the low/high ends, like the
original did).
"""
import math
from typing import Optional

# attacking type -> {defending type: multiplier}. Any pair not listed is neutral (1x).
TYPE_CHART = {
    "normal":   {"rock": 0.5, "ghost": 0, "steel": 0.5},
    "fire":     {"fire": 0.5, "water": 0.5, "grass": 2, "ice": 2, "bug": 2, "rock": 0.5, "dragon": 0.5, "steel": 2},
    "water":    {"fire": 2, "water": 0.5, "grass": 0.5, "ground": 2, "rock": 2, "dragon": 0.5},
    "electric": {"water": 2, "electric": 0.5, "grass": 0.5, "ground": 0, "flying": 2, "dragon": 0.5},
    "grass":    {"fire": 0.5, "water": 2, "grass": 0.5, "poison": 0.5, "ground": 2, "flying": 0.5, "bug": 0.5, "rock": 2, "dragon": 0.5, "steel": 0.5},
    "ice":      {"fire": 0.5, "water": 0.5, "grass": 2, "ice": 0.5, "ground": 2, "flying": 2, "dragon": 2, "steel": 0.5},
    "fighting": {"normal": 2, "ice": 2, "poison": 0.5, "flying": 0.5, "psychic": 0.5, "bug": 0.5, "rock": 2, "ghost": 0, "dark": 2, "steel": 2, "fairy": 0.5},
    "poison":   {"grass": 2, "poison": 0.5, "ground": 0.5, "rock": 0.5, "ghost": 0.5, "steel": 0, "fairy": 2},
    "ground":   {"fire": 2, "electric": 2, "grass": 0.5, "poison": 2, "flying": 0, "bug": 0.5, "rock": 2, "steel": 2},
    "flying":   {"electric": 0.5, "grass": 2, "fighting": 2, "bug": 2, "rock": 0.5, "steel": 0.5},
    "psychic":  {"fighting": 2, "poison": 2, "psychic": 0.5, "dark": 0, "steel": 0.5},
    "bug":      {"fire": 0.5, "grass": 2, "fighting": 0.5, "poison": 0.5, "flying": 0.5, "psychic": 2, "ghost": 0.5, "dark": 2, "steel": 0.5, "fairy": 0.5},
    "rock":     {"fire": 2, "ice": 2, "fighting": 0.5, "ground": 0.5, "flying": 2, "bug": 2, "steel": 0.5},
    "ghost":    {"normal": 0, "psychic": 2, "ghost": 2, "dark": 0.5},
    "dragon":   {"dragon": 2, "steel": 0.5, "fairy": 0},
    "dark":     {"fighting": 0.5, "psychic": 2, "ghost": 2, "dark": 0.5, "fairy": 0.5},
    "steel":    {"fire": 0.5, "water": 0.5, "electric": 0.5, "ice": 2, "rock": 2, "steel": 0.5, "fairy": 2},
    "fairy":    {"fire": 0.5, "fighting": 2, "poison": 0.5, "dragon": 2, "dark": 2, "steel": 0.5},
}

# name -> (boosted stat, lowered stat); None means neutral nature.
NATURES = {
    "hardy": (None, None), "lonely": ("atk", "def"), "brave": ("atk", "spe"),
    "adamant": ("atk", "spa"), "naughty": ("atk", "spd"), "bold": ("def", "atk"),
    "docile": (None, None), "relaxed": ("def", "spe"), "impish": ("def", "spa"),
    "lax": ("def", "spd"), "timid": ("spe", "atk"), "hasty": ("spe", "def"),
    "serious": (None, None), "jolly": ("spe", "spa"), "naive": ("spe", "spd"),
    "modest": ("spa", "atk"), "mild": ("spa", "def"), "quiet": ("spa", "spe"),
    "bashful": (None, None), "rash": ("spa", "spd"), "calm": ("spd", "atk"),
    "gentle": ("spd", "def"), "sassy": ("spd", "spe"), "careful": ("spd", "spa"),
    "quirky": (None, None),
}

ITEM_DAMAGE_MODS = {
    "life-orb": {"power_mult": 1.3},
    "choice-band": {"atk_mult": 1.5},
    "choice-specs": {"spa_mult": 1.5},
    "expert-belt": {"se_only_mult": 1.2},
    "muscle-band": {"physical_power_mult": 1.1},
    "wise-glasses": {"special_power_mult": 1.1},
}

ABILITY_DAMAGE_MODS = {
    "huge-power": {"atk_stat_mult": 2},
    "pure-power": {"atk_stat_mult": 2},
    "adaptability": {"stab_mult": 2},
    "technician": {"low_power_mult": 1.5, "low_power_threshold": 60},
    "solid-rock": {"se_reduce_mult": 0.75},
    "filter": {"se_reduce_mult": 0.75},
    "thick-fat": {"fire_ice_reduce_mult": 0.5},
    "levitate": {"immune_to_type": "ground"},
    "water-absorb": {"immune_to_type": "water"},
    "volt-absorb": {"immune_to_type": "electric"},
    "flash-fire": {"immune_to_type": "fire"},
    "sap-sipper": {"immune_to_type": "grass"},
}


def type_effectiveness(attacking_type: str, defending_types: list) -> float:
    mult = 1.0
    for def_type in defending_types:
        mult *= TYPE_CHART.get(attacking_type, {}).get(def_type, 1)
    return mult


def stat_at_level(base: int, ev: int, iv: int, level: int, stat_key: str, nature: Optional[str]) -> int:
    if stat_key == "hp":
        return math.floor(((2 * base + iv + ev) * level) / 100) + level + 10
    raw = math.floor(((2 * base + iv + ev) * level) / 100) + 5
    boosted, lowered = NATURES.get((nature or "").lower(), (None, None))
    if boosted == stat_key:
        return math.floor(raw * 1.1)
    if lowered == stat_key:
        return math.floor(raw * 0.9)
    return raw


def stage_multiplier(stage: int) -> float:
    if stage >= 0:
        return (2 + stage) / 2
    return 2 / (2 - stage)


class Combatant:
    """One side of a damage calc: a Pokemon's stats/build plus its battle state."""

    def __init__(self, base_stats: dict, types: list, evs: dict, nature: str,
                 ability: Optional[str] = None, item: Optional[str] = None,
                 level: int = 50, stages: Optional[dict] = None, iv: int = 31):
        self.base_stats = base_stats  # {"hp","atk","def","spa","spd","spe"}
        self.types = [t for t in types if t]
        self.evs = evs
        self.nature = nature
        self.ability = (ability or "").lower().replace(" ", "-")
        self.item = (item or "").lower().replace(" ", "-")
        self.level = level
        self.stages = stages or {}
        self.iv = iv

    def stat(self, key: str) -> int:
        return stat_at_level(self.base_stats[key], self.evs.get(key, 0), self.iv, self.level, key, self.nature)


def compute_damage(attacker: Combatant, defender: Combatant, move: dict, field: Optional[dict] = None) -> dict:
    """move: {"type", "category" ("physical"/"special"), "power"}.
    field: optional dict of {"crit", "weather", "terrain", "reflect", "lightscreen", "burn"}.
    """
    field = field or {}

    if move.get("category") not in ("physical", "special") or not move.get("power"):
        return {"error": "Move is a status move or has no fixed power — not supported by this calculator."}

    atk_stat_key = "atk" if move["category"] == "physical" else "spa"
    def_stat_key = "def" if move["category"] == "physical" else "spd"

    atk_ability_mod = ABILITY_DAMAGE_MODS.get(attacker.ability, {})
    def_ability_mod = ABILITY_DAMAGE_MODS.get(defender.ability, {})
    atk_item_mod = ITEM_DAMAGE_MODS.get(attacker.item, {})

    if def_ability_mod.get("immune_to_type") == move["type"]:
        return {"immune": True, "reason": f"Defender's ability makes it immune to {move['type']}-type moves."}

    type_eff = type_effectiveness(move["type"], defender.types)
    if type_eff == 0:
        return {"immune": True, "reason": f"{move['type']}-type moves have no effect on the defender (type immunity)."}

    atk_stat = attacker.stat(atk_stat_key)
    atk_stat = math.floor(atk_stat * stage_multiplier(attacker.stages.get(atk_stat_key, 0)))
    if atk_ability_mod.get("atk_stat_mult") and atk_stat_key == "atk":
        atk_stat = math.floor(atk_stat * atk_ability_mod["atk_stat_mult"])
    if atk_item_mod.get("atk_mult") and move["category"] == "physical":
        atk_stat = math.floor(atk_stat * atk_item_mod["atk_mult"])
    if atk_item_mod.get("spa_mult") and move["category"] == "special":
        atk_stat = math.floor(atk_stat * atk_item_mod["spa_mult"])
    if field.get("burn") and move["category"] == "physical":
        atk_stat = math.floor(atk_stat * 0.5)

    def_stat = defender.stat(def_stat_key)
    def_stat = math.floor(def_stat * stage_multiplier(defender.stages.get(def_stat_key, 0)))

    crit_on = bool(field.get("crit"))
    if not crit_on:
        if move["category"] == "physical" and field.get("reflect"):
            def_stat = math.floor(def_stat * 1.5)
        if move["category"] == "special" and field.get("lightscreen"):
            def_stat = math.floor(def_stat * 1.5)

    weather = field.get("weather", "none")
    if weather == "sand" and def_stat_key == "spd" and "rock" in defender.types:
        def_stat = math.floor(def_stat * 1.5)
    if weather == "snow" and def_stat_key == "def" and "ice" in defender.types:
        def_stat = math.floor(def_stat * 1.5)

    power = float(move["power"])
    if atk_item_mod.get("power_mult"):
        power *= atk_item_mod["power_mult"]
    if move["category"] == "physical" and atk_item_mod.get("physical_power_mult"):
        power *= atk_item_mod["physical_power_mult"]
    if move["category"] == "special" and atk_item_mod.get("special_power_mult"):
        power *= atk_item_mod["special_power_mult"]
    if atk_ability_mod.get("low_power_mult") and power <= atk_ability_mod.get("low_power_threshold", 0):
        power *= atk_ability_mod["low_power_mult"]

    level = attacker.level
    base_damage = math.floor(math.floor(math.floor((2 * level) / 5 + 2) * power * atk_stat / def_stat) / 50) + 2

    stab = (atk_ability_mod.get("stab_mult", 1.5) if move["type"] in attacker.types else 1)
    crit = 1.5 if crit_on else 1

    weather_mult = 1
    if weather == "sun":
        if move["type"] == "fire":
            weather_mult = 1.5
        if move["type"] == "water":
            weather_mult = 0.5
    if weather == "rain":
        if move["type"] == "water":
            weather_mult = 1.5
        if move["type"] == "fire":
            weather_mult = 0.5

    se_mult = 1.0
    if type_eff > 1 and atk_item_mod.get("se_only_mult"):
        se_mult *= atk_item_mod["se_only_mult"]
    if type_eff > 1 and def_ability_mod.get("se_reduce_mult"):
        se_mult *= def_ability_mod["se_reduce_mult"]
    if def_ability_mod.get("fire_ice_reduce_mult") and move["type"] in ("fire", "ice"):
        se_mult *= def_ability_mod["fire_ice_reduce_mult"]

    modifiers = type_eff * stab * crit * weather_mult * se_mult
    dmg_low = math.floor(base_damage * modifiers * 0.85)
    dmg_high = math.floor(base_damage * modifiers * 1.0)

    def_hp = defender.stat("hp")
    pct_low = (dmg_low / def_hp) * 100
    pct_high = (dmg_high / def_hp) * 100

    if pct_low >= 100:
        ko_text = "Guaranteed OHKO"
    elif pct_high >= 100:
        ko_text = "Possible OHKO"
    else:
        ko_text = f"~{math.ceil(100 / pct_high)}HKO (worst-case roll)"

    return {
        "dmg_low": dmg_low,
        "dmg_high": dmg_high,
        "pct_low": round(pct_low, 1),
        "pct_high": round(pct_high, 1),
        "defender_hp": def_hp,
        "ko_text": ko_text,
        "type_effectiveness": type_eff,
        "stab": stab,
    }
