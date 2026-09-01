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

from app import abilities

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

# Held items that boost one type by 1.2x. These matter more than they look:
# Black Glasses is the most-used item on the format's most-used Pokemon, and
# leaving them out understated those calcs by a fifth.
#
# The boost applies to the move's RESOLVED type, so a Fairy Feather does boost
# a Pixilate-converted Hyper Voice.
TYPE_BOOST_ITEMS = {
    "silk-scarf": "normal",
    "charcoal": "fire",
    "mystic-water": "water",
    "magnet": "electric",
    "miracle-seed": "grass",
    "never-melt-ice": "ice",
    "black-belt": "fighting",
    "poison-barb": "poison",
    "soft-sand": "ground",
    "sharp-beak": "flying",
    "twisted-spoon": "psychic",
    "silver-powder": "bug",
    "hard-stone": "rock",
    "spell-tag": "ghost",
    "dragon-fang": "dragon",
    "black-glasses": "dark",
    "metal-coat": "steel",
    "fairy-feather": "fairy",
    # Plates behave identically for damage purposes.
    "flame-plate": "fire", "splash-plate": "water", "zap-plate": "electric",
    "meadow-plate": "grass", "icicle-plate": "ice", "fist-plate": "fighting",
    "toxic-plate": "poison", "earth-plate": "ground", "sky-plate": "flying",
    "mind-plate": "psychic", "insect-plate": "bug", "stone-plate": "rock",
    "spooky-plate": "ghost", "draco-plate": "dragon", "dread-plate": "dark",
    "iron-plate": "steel", "pixie-plate": "fairy",
}

TYPE_BOOST_ITEM_MULT = 1.2

# Items that raise a defensive stat.
DEFENSIVE_ITEM_MODS = {
    "assault-vest": {"spd_mult": 1.5},
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


# --- the games' fixed-point modifier arithmetic ---------------------------
#
# Damage modifiers are 4096ths, chained together before being applied, and
# rounded with a rule that breaks ties downward rather than up. Doing this in
# plain floating point drifts by roughly a percent, which is the difference
# between agreeing and disagreeing with Showdown on a borderline OHKO.

MOD_SCALE = 4096


def poke_round(value: float) -> int:
    """The games round .5 down, unlike Python's round() and math.floor+0.5."""
    floor = math.floor(value)
    return floor if value - floor <= 0.5 else floor + 1


def chain(*multipliers) -> int:
    """Combine multipliers in 4096ths, the way the games chain them."""
    result = MOD_SCALE
    for m in multipliers:
        if m == 1 or m is None:
            continue
        mod = round(m * MOD_SCALE)
        result = (result * mod + 2048) >> 12
    return result


def apply_modifier(value: float, modifier: int) -> int:
    return poke_round(value * modifier / MOD_SCALE)


def type_effectiveness(attacking_type: str, defending_types: list) -> float:
    mult = 1.0
    for def_type in defending_types:
        mult *= TYPE_CHART.get(attacking_type, {}).get(def_type, 1)
    return mult


# Champions rescaled the classic EV system rather than replacing it: a stat
# caps at 32 points instead of 252, and a team gets 66 instead of 508. One
# Champions point is therefore worth 8 classic EVs, and since the classic
# formula divides EVs by 4, that comes out as multiplying by 2 here.
#
# Verified against Pikalytics' own numbers for a Jolly 2/32/0/0/0/32 Garchomp:
# with this multiplier all six stats match exactly (185/182/115/90/105/169),
# and without it only the zero-EV stats do.
EV_TO_STAT_POINTS = 2


def stat_at_level(base: int, ev: int, iv: int, level: int, stat_key: str, nature: Optional[str]) -> int:
    ev = ev * EV_TO_STAT_POINTS
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
                 level: int = 50, stages: Optional[dict] = None, iv: int = 31,
                 status: str = "healthy", current_hp_percent: float = 100.0,
                 type_override: Optional[list] = None):
        self.base_stats = base_stats  # {"hp","atk","def","spa","spd","spe"}
        self.types = [t for t in (type_override or types) if t]
        self.evs = evs
        self.nature = nature
        self.ability = (ability or "").lower().replace(" ", "-")
        self.item = (item or "").lower().replace(" ", "-")
        self.level = level
        self.stages = stages or {}
        self.iv = iv
        self.status = (status or "healthy").lower()
        self.current_hp_percent = current_hp_percent

    def stat(self, key: str) -> int:
        return stat_at_level(self.base_stats[key], self.evs.get(key, 0), self.iv, self.level, key, self.nature)

    def current_hp(self) -> int:
        return max(1, math.floor(self.stat("hp") * self.current_hp_percent / 100))


def is_grounded(types: list, ability: str) -> bool:
    """Terrain only affects grounded Pokemon. Approximation: Flying types and
    Levitate float; held items like Air Balloon aren't modelled."""
    return "flying" not in types and ability != "levitate"


def compute_damage(attacker: Combatant, defender: Combatant, move: dict, field: Optional[dict] = None) -> dict:
    """move: {"type", "category" ("physical"/"special"), "power"}.
    field: optional dict of {"crit", "weather", "terrain", "reflect", "lightscreen",
    "doubles", "helping_hand", "friend_guard"}. Attacker/defender status
    (burn/paralysis/poison) lives on the Combatant, not the field.
    """
    field = field or {}

    if move.get("category") not in ("physical", "special") or not move.get("power"):
        return {"error": "Move is a status move or has no fixed power — not supported by this calculator."}

    atk_stat_key = "atk" if move["category"] == "physical" else "spa"
    def_stat_key = "def" if move["category"] == "physical" else "spd"

    atk_item_mod = ITEM_DAMAGE_MODS.get(attacker.item, {})

    # Resolve what type the move actually is before anything else. Pixilate
    # and friends turn a Normal move into another type, which changes type
    # effectiveness and can grant STAB - so every later step has to use this
    # resolved type, not the move's printed one.
    move_type, ate_power_mult = abilities.effective_move_type(move["type"], attacker.ability)

    type_eff = type_effectiveness(move_type, defender.types)

    immunity = abilities.defender_immunity(defender.ability, move_type, type_eff)
    if immunity:
        return {"immune": True, "reason": immunity}
    if type_eff == 0:
        return {"immune": True, "reason": f"{move_type}-type moves have no effect on the defender (type immunity)."}

    weather = field.get("weather", "none")

    atk_stat = attacker.stat(atk_stat_key)
    atk_stat = math.floor(atk_stat * stage_multiplier(attacker.stages.get(atk_stat_key, 0)))
    ability_stat_mult = abilities.attack_stat_multiplier(attacker, move["category"])
    ability_stat_mult *= abilities.special_attack_multiplier(attacker, move["category"], weather)
    if ability_stat_mult != 1.0:
        atk_stat = math.floor(atk_stat * ability_stat_mult)
    if atk_item_mod.get("atk_mult") and move["category"] == "physical":
        atk_stat = math.floor(atk_stat * atk_item_mod["atk_mult"])
    if atk_item_mod.get("spa_mult") and move["category"] == "special":
        atk_stat = math.floor(atk_stat * atk_item_mod["spa_mult"])
    # Burn halves physical Attack, unless the attacker has Guts.
    if (
        attacker.status == "burn"
        and move["category"] == "physical"
        and not abilities.ignores_burn(attacker.ability)
    ):
        atk_stat = math.floor(atk_stat * 0.5)

    def_stat = defender.stat(def_stat_key)
    def_stat = math.floor(def_stat * stage_multiplier(defender.stages.get(def_stat_key, 0)))
    def_item_mod = DEFENSIVE_ITEM_MODS.get(defender.item, {})
    if def_stat_key == "spd" and def_item_mod.get("spd_mult"):
        def_stat = math.floor(def_stat * def_item_mod["spd_mult"])
    if def_stat_key == "def" and def_item_mod.get("def_mult"):
        def_stat = math.floor(def_stat * def_item_mod["def_mult"])

    crit_on = bool(field.get("crit"))
    if not crit_on:
        if move["category"] == "physical" and field.get("reflect"):
            def_stat = math.floor(def_stat * 1.5)
        if move["category"] == "special" and field.get("lightscreen"):
            def_stat = math.floor(def_stat * 1.5)

    if weather == "sand" and def_stat_key == "spd" and "rock" in defender.types:
        def_stat = math.floor(def_stat * 1.5)
    if weather == "snow" and def_stat_key == "def" and "ice" in defender.types:
        def_stat = math.floor(def_stat * 1.5)

    # Power modifiers are chained in 4096ths and rounded once at the end, the
    # way the games do it - multiplying floats and rounding at the end drifts
    # by about a percent, which is enough to disagree with every other
    # calculator on a borderline OHKO.
    power_mods = [ate_power_mult]
    if TYPE_BOOST_ITEMS.get(attacker.item) == move_type:
        power_mods.append(TYPE_BOOST_ITEM_MULT)
    if move["category"] == "physical" and atk_item_mod.get("physical_power_mult"):
        power_mods.append(atk_item_mod["physical_power_mult"])
    if move["category"] == "special" and atk_item_mod.get("special_power_mult"):
        power_mods.append(atk_item_mod["special_power_mult"])
    power_mods.append(abilities.power_multiplier(attacker, move_type, float(move["power"]), weather))

    # Terrain boosts its matching type for grounded attackers, and Misty Terrain
    # halves Dragon moves against grounded defenders.
    terrain = field.get("terrain", "none")
    terrain_mult = 1.0
    if terrain != "none":
        atk_grounded = is_grounded(attacker.types, attacker.ability)
        def_grounded = is_grounded(defender.types, defender.ability)
        if atk_grounded and (
            (terrain == "electric" and move_type == "electric")
            or (terrain == "grassy" and move_type == "grass")
            or (terrain == "psychic" and move_type == "psychic")
        ):
            terrain_mult = 1.3
        if terrain == "misty" and move_type == "dragon" and def_grounded:
            terrain_mult = 0.5
    power_mods.append(terrain_mult)

    if field.get("helping_hand"):
        power_mods.append(1.5)

    power = max(1, apply_modifier(float(move["power"]), chain(*power_mods)))

    level = attacker.level
    base_damage = math.floor(math.floor(math.floor((2 * level) / 5 + 2) * power * atk_stat / def_stat) / 50) + 2

    stab = abilities.stab_multiplier(attacker.ability) if move_type in attacker.types else 1

    weather_mult = 1
    if weather == "sun":
        if move_type == "fire":
            weather_mult = 1.5
        if move_type == "water":
            weather_mult = 0.5
    if weather == "rain":
        if move_type == "water":
            weather_mult = 1.5
        if move_type == "fire":
            weather_mult = 0.5

    se_mult = 1.0
    if type_eff > 1 and atk_item_mod.get("se_only_mult"):
        se_mult *= atk_item_mod["se_only_mult"]
    ability_mult = abilities.final_damage_multiplier(
        attacker, defender, move_type, move["category"], type_eff
    )

    # Doubles: spread moves hit multiple targets for 0.75x each. We don't know
    # per-move target counts, so this is applied as a user-toggled field option.
    spread_mult = 0.75 if field.get("doubles") and field.get("spread_move") else 1.0
    friend_guard_mult = 0.75 if field.get("friend_guard") else 1.0

    # Applied in the games' order, with their rounding at each step. "Final"
    # modifiers (Life Orb, Expert Belt, Multiscale, Filter, Friend Guard...)
    # are chained together and applied last, not folded into power.
    final_mod = chain(
        se_mult,
        ability_mult,
        friend_guard_mult,
        atk_item_mod.get("power_mult", 1),  # Life Orb is a final modifier
    )

    rolls = []
    for i in range(16):
        damage = base_damage
        damage = apply_modifier(damage, chain(spread_mult))
        damage = apply_modifier(damage, chain(weather_mult))
        if crit_on:
            damage = math.floor(damage * 1.5)
        damage = math.floor(damage * (85 + i) / 100)
        damage = apply_modifier(damage, chain(stab))
        damage = math.floor(damage * type_eff)
        damage = apply_modifier(damage, final_mod)
        rolls.append(max(1, damage))
    dmg_low, dmg_high = rolls[0], rolls[-1]

    def_max_hp = defender.stat("hp")
    def_hp = defender.current_hp()
    pct_low = (dmg_low / def_max_hp) * 100
    pct_high = (dmg_high / def_max_hp) * 100

    # Sitrus Berry heals 25% max HP once when the holder drops below half.
    recovery = math.floor(def_max_hp * 0.25) if defender.item == "sitrus-berry" else 0

    ko_chance_pct, ko_text = _ko_analysis(rolls, def_hp, recovery)

    return {
        "dmg_low": dmg_low,
        "dmg_high": dmg_high,
        "pct_low": round(pct_low, 1),
        "pct_high": round(pct_high, 1),
        "defender_hp": def_max_hp,
        "defender_current_hp": def_hp,
        "rolls": rolls,
        "ko_text": ko_text,
        "ko_chance_percent": ko_chance_pct,
        "type_effectiveness": type_eff,
        "stab": stab,
    }


def _ko_analysis(rolls: list, hp: int, recovery: int = 0):
    """Return (chance_to_ko_in_n_hits_percent, human text).

    Counts how many of the 16 equally-likely rolls KO in N hits, so we can
    report e.g. "2.7% chance to 2HKO" rather than just a min/max range.
    `recovery` models a one-time item heal (Sitrus Berry) applied between hits.
    """
    n_rolls = len(rolls)

    for hits in range(1, 5):
        ko_count = 0
        any_heal = False  # only mention the berry if it actually triggered
        for r in rolls:
            remaining = hp
            healed = False
            for _ in range(hits):
                remaining -= r
                if remaining <= 0:
                    break
                if recovery and not healed and remaining <= hp / 2:
                    remaining = min(hp, remaining + recovery)
                    healed = True
                    any_heal = True
            if remaining <= 0:
                ko_count += 1

        if ko_count == 0:
            continue

        suffix = " after Sitrus Berry recovery" if any_heal else ""
        if ko_count == n_rolls:
            return 100.0, f"Guaranteed {hits}HKO{suffix}"
        pct = round(ko_count / n_rolls * 100, 1)
        return pct, f"{pct}% chance to {hits}HKO{suffix}"

    return 0.0, "5HKO or slower"
