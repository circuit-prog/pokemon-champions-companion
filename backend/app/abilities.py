"""How abilities change a damage calculation.

Kept separate from damage_calc.py because there are a lot of them and they
apply at four different points: some change what type the move even is, some
scale the attacking stat, some scale power, and some scale the final damage.
Getting the order wrong gives plausible-looking numbers that are quietly
incorrect, which is worse than not modelling the ability at all.

Not modelled, and deliberately so: anything needing a move flag we don't
store (contact, sound, punch, bite, pulse, recoil), which rules out Tough
Claws, Iron Fist, Strong Jaw, Mega Launcher, Punk Rock, Reckless, Fluffy and
Sheer Force; and anything needing turn order (Analytic) or switch tracking
(Intrepid Sword). See UNSUPPORTED_ABILITIES - the calculator reports these
rather than silently ignoring them.
"""
from typing import Optional

# --- type-changing ("-ate") abilities -------------------------------------
#
# These fire before anything else: Pixilate makes Hyper Voice a Fairy move,
# which changes type effectiveness AND grants STAB to a Fairy user. Missing
# them understated damage by roughly 3.6x in that example.

ATE_ABILITIES = {
    "pixilate": "fairy",
    "aerilate": "flying",
    "refrigerate": "ice",
    "galvanize": "electric",
}

# Normalize converts every move to Normal, not just Normal ones.
NORMALIZE = "normalize"

# Gen 6 boosted -ate moves by 1.3x; Gen 7 onward it is 1.2x.
ATE_POWER_MULT = 1.2

# --- attacker: power multipliers by move type ------------------------------

TYPE_BOOST_ABILITIES = {
    "steelworker": ("steel", 1.5),
    "steely-spirit": ("steel", 1.5),
    "dragons-maw": ("dragon", 1.5),
    "rocky-payload": ("rock", 1.5),
    "transistor": ("electric", 1.3),   # 1.5 in Gen 8, nerfed to 1.3 in Gen 9
    "water-bubble": ("water", 2.0),
}

# Pinch abilities: 1.5x their type once the holder is at or below 1/3 HP.
PINCH_ABILITIES = {
    "overgrow": "grass",
    "blaze": "fire",
    "torrent": "water",
    "swarm": "bug",
}

# --- defender: final damage multipliers ------------------------------------

DEFENSIVE_TYPE_RESIST = {
    "heatproof": {"fire": 0.5},
    "thick-fat": {"fire": 0.5, "ice": 0.5},
    "water-bubble": {"fire": 0.5},
    "purifying-salt": {"ghost": 0.5},
}

# Abilities that nullify a type outright.
IMMUNITY_ABILITIES = {
    "levitate": "ground",
    "earth-eater": "ground",
    "flash-fire": "fire",
    "well-baked-body": "fire",
    "water-absorb": "water",
    "dry-skin": "water",
    "storm-drain": "water",
    "volt-absorb": "electric",
    "lightning-rod": "electric",
    "motor-drive": "electric",
    "sap-sipper": "grass",
}

# Abilities we know about but cannot model with the data we store.
UNSUPPORTED_ABILITIES = {
    "tough-claws", "iron-fist", "strong-jaw", "mega-launcher", "punk-rock",
    "reckless", "fluffy", "sheer-force", "analytic", "stakeout", "unseen-fist",
}


def effective_move_type(move_type: str, attacker_ability: str) -> tuple:
    """The type a move actually has once the attacker's ability is applied.

    Returns (type, power_multiplier).
    """
    ability = (attacker_ability or "").lower()
    if ability == NORMALIZE:
        return "normal", ATE_POWER_MULT
    new_type = ATE_ABILITIES.get(ability)
    if new_type and move_type == "normal":
        return new_type, ATE_POWER_MULT
    return move_type, 1.0


def defender_immunity(defender_ability: str, move_type: str, type_eff: float) -> Optional[str]:
    """A reason string if the defender's ability blocks the move entirely."""
    ability = (defender_ability or "").lower()
    if ability == "wonder-guard" and type_eff <= 1:
        return "Wonder Guard blocks everything that isn't super effective."
    if IMMUNITY_ABILITIES.get(ability) == move_type:
        return f"{ability.replace('-', ' ').title()} makes the defender immune to {move_type}-type moves."
    return None


def attack_stat_multiplier(attacker, move_category: str) -> float:
    """Abilities that scale the attacking stat rather than the move."""
    ability = (attacker.ability or "").lower()
    mult = 1.0
    if move_category == "physical":
        if ability in ("huge-power", "pure-power"):
            mult *= 2.0
        if ability == "hustle":
            mult *= 1.5
        # Guts trades a status condition for 50% more Attack.
        if ability == "guts" and attacker.status not in ("healthy", "", None):
            mult *= 1.5
    return mult


def ignores_burn(attacker_ability: str) -> bool:
    """Guts holders hit at full power through a burn."""
    return (attacker_ability or "").lower() == "guts"


def power_multiplier(attacker, move_type: str, move_power: float, weather: str) -> float:
    """Ability multipliers that apply to the move's power."""
    ability = (attacker.ability or "").lower()
    mult = 1.0

    boost = TYPE_BOOST_ABILITIES.get(ability)
    if boost and boost[0] == move_type:
        mult *= boost[1]

    pinch_type = PINCH_ABILITIES.get(ability)
    if pinch_type == move_type and attacker.current_hp_percent <= (100 / 3):
        mult *= 1.5

    if ability == "technician" and move_power <= 60:
        mult *= 1.5

    if ability == "sand-force" and weather == "sand" and move_type in ("rock", "ground", "steel"):
        mult *= 1.3

    return mult


def special_attack_multiplier(attacker, move_category: str, weather: str) -> float:
    """Solar Power raises Special Attack in sun (at the cost of HP each turn,
    which isn't a damage concern)."""
    if move_category != "special":
        return 1.0
    if (attacker.ability or "").lower() == "solar-power" and weather == "sun":
        return 1.5
    return 1.0


def stab_multiplier(attacker_ability: str) -> float:
    return 2.0 if (attacker_ability or "").lower() == "adaptability" else 1.5


def final_damage_multiplier(attacker, defender, move_type: str, move_category: str, type_eff: float) -> float:
    """Everything applied to the damage after the base calculation."""
    atk_ability = (attacker.ability or "").lower()
    def_ability = (defender.ability or "").lower()
    mult = 1.0

    # Attacker side
    if atk_ability == "tinted-lens" and type_eff < 1:
        mult *= 2.0
    if atk_ability == "neuroforce" and type_eff > 1:
        mult *= 1.25

    # Defender side
    if type_eff > 1 and def_ability in ("filter", "solid-rock", "prism-armor"):
        mult *= 0.75
    if def_ability in ("multiscale", "shadow-shield") and defender.current_hp_percent >= 100:
        mult *= 0.5
    if def_ability == "ice-scales" and move_category == "special":
        mult *= 0.5
    if def_ability == "fur-coat" and move_category == "physical":
        mult *= 0.5
    if def_ability == "dry-skin" and move_type == "fire":
        mult *= 1.25

    resist = DEFENSIVE_TYPE_RESIST.get(def_ability, {})
    if move_type in resist:
        mult *= resist[move_type]

    return mult


def unsupported_notes(attacker_ability: str, defender_ability: str) -> list:
    """Abilities in play that we knowingly don't model, so the caller can say
    so rather than presenting an incomplete number as exact."""
    notes = []
    for ability, side in ((attacker_ability, "attacker"), (defender_ability, "defender")):
        slug = (ability or "").lower()
        if slug in UNSUPPORTED_ABILITIES:
            notes.append(f"{slug.replace('-', ' ').title()} ({side}) isn't modelled yet.")
    return notes
