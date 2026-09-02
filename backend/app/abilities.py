"""How abilities change a damage calculation.

Kept separate from damage_calc.py because there are a lot of them and they
apply at four different points: some change what type the move even is, some
scale the attacking stat, some scale power, and some scale the final damage.
Getting the order wrong gives plausible-looking numbers that are quietly
incorrect, which is worse than not modelling the ability at all.

Sound moves are handled by listing them here, because the set is small and
stable and three abilities depend on it (Liquid Voice, Punk Rock, Soundproof).

Still not modelled: abilities needing flags we have no list for - contact,
punch, bite, pulse, recoil - which rules out Tough Claws, Iron Fist, Strong
Jaw, Mega Launcher, Reckless, Fluffy and Sheer Force; and anything needing
turn order (Analytic). See UNSUPPORTED_ABILITIES - the calculator reports
these rather than silently ignoring them.
"""
from typing import Optional

# Sound-based moves. PokeAPI doesn't expose the flag, but the list is short
# and rarely changes, so hard-coding it is more useful than pretending the
# abilities that depend on it don't exist. Damaging moves only - the status
# ones never reach a damage calculation.
SOUND_MOVES = {
    "hyper-voice", "boomburst", "bug-buzz", "snarl", "round", "echoed-voice",
    "disarming-voice", "alluring-voice", "sparkling-aria", "overdrive",
    "psychic-noise", "relic-song", "clanging-scales", "clangorous-soul",
    "clangorous-soulblaze", "eerie-spell", "chatter", "snore", "torch-song",
    "hyper-drill",
}


def is_sound_move(move_name: str) -> bool:
    return (move_name or "").lower() in SOUND_MOVES


# Slicing moves, for Sharpness. Same reasoning as the sound list: short,
# stable, and an ability the meta actually runs depends on it.
SLICING_MOVES = {
    "aerial-ace", "air-cutter", "air-slash", "aqua-cutter", "behemoth-blade",
    "bitter-blade", "ceaseless-edge", "cross-poison", "cut", "fury-cutter",
    "kowtow-cleave", "leaf-blade", "night-slash", "population-bomb",
    "psyblade", "psycho-cut", "razor-leaf", "razor-shell", "sacred-sword",
    "secret-sword", "slash", "solar-blade", "stone-axe", "x-scissor",
}

# Ball and bomb moves, for Bulletproof.
BULLET_MOVES = {
    "acid-spray", "aura-sphere", "barrage", "beak-blast", "bullet-seed",
    "egg-bomb", "electro-ball", "energy-ball", "focus-blast", "gyro-ball",
    "ice-ball", "magnet-bomb", "mist-ball", "mud-bomb", "octazooka",
    "pollen-puff", "pyro-ball", "rock-blast", "rock-wrecker", "searing-shot",
    "seed-bomb", "shadow-ball", "sludge-bomb", "syrup-bomb", "weather-ball",
    "zap-cannon",
}

# Powder and spore moves, for Overcoat. Only Powder itself deals damage
# indirectly, but Rage Powder and the sleep powders matter for immunity.
POWDER_MOVES = {
    "cotton-spore", "magic-powder", "poison-powder", "powder", "rage-powder",
    "sleep-powder", "spore", "stun-spore",
}


def is_slicing_move(move_name: str) -> bool:
    return (move_name or "").lower() in SLICING_MOVES


def is_bullet_move(move_name: str) -> bool:
    return (move_name or "").lower() in BULLET_MOVES


def is_powder_move(move_name: str) -> bool:
    return (move_name or "").lower() in POWDER_MOVES


# --- weather and terrain set by an ability ---------------------------------
#
# These matter more than any single multiplier: Charizard-Mega-Y is the
# format's 4th most-used Pokemon and its Drought means every Fire move it
# throws is in sun, permanently. Calculating it in clear weather understated
# it by a third every single time.

WEATHER_SETTERS = {
    "drought": "sun",
    "orichalcum-pulse": "sun",
    "desolate-land": "sun",
    "drizzle": "rain",
    "primordial-sea": "rain",
    "sand-stream": "sand",
    "sand-spit": "sand",
    "snow-warning": "snow",
}

TERRAIN_SETTERS = {
    "electric-surge": "electric",
    "hadron-engine": "electric",
    "grassy-surge": "grassy",
    "misty-surge": "misty",
    "psychic-surge": "psychic",
    "seed-sower": "grassy",
}


def implied_weather(attacker_ability: str, defender_ability: str) -> str:
    """Weather either side's ability sets just by being on the field.

    The attacker wins ties only because something has to; in a real battle it
    depends on switch order, which a calculator has no way to know.
    """
    for ability in ((attacker_ability or "").lower(), (defender_ability or "").lower()):
        if ability in WEATHER_SETTERS:
            return WEATHER_SETTERS[ability]
    return "none"


def implied_terrain(attacker_ability: str, defender_ability: str) -> str:
    for ability in ((attacker_ability or "").lower(), (defender_ability or "").lower()):
        if ability in TERRAIN_SETTERS:
            return TERRAIN_SETTERS[ability]
    return "none"


# Auras boost a type for BOTH sides, and Aura Break inverts them.
AURA_ABILITIES = {
    "fairy-aura": "fairy",
    "dark-aura": "dark",
}
AURA_MULT = 1.33
AURA_BREAK_MULT = 0.75


def aura_multiplier(attacker_ability: str, defender_ability: str, move_type: str) -> float:
    """Fairy Aura and Dark Aura apply to everyone on the field, not just the
    holder - including the opponent's moves of that type."""
    abilities_in_play = [
        (attacker_ability or "").lower(),
        (defender_ability or "").lower(),
    ]
    if not any(AURA_ABILITIES.get(a) == move_type for a in abilities_in_play):
        return 1.0
    if "aura-break" in abilities_in_play:
        return AURA_BREAK_MULT
    return AURA_MULT


def prevents_crit(defender_ability: str) -> bool:
    """Battle Armor and Shell Armor make the holder uncrittable."""
    return (defender_ability or "").lower() in ("battle-armor", "shell-armor")


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
# Need a contact/punch/bite/pulse/recoil flag. Sound and slicing moves are
# listed by hand above, but contact alone covers hundreds of moves, so these
# wait for a move-data source that marks flags properly.
NEEDS_MOVE_FLAG = {
    "tough-claws", "iron-fist", "strong-jaw", "mega-launcher", "reckless",
    "fluffy", "unseen-fist", "sheer-force",
}

# Depend on battle state a calculator has no way to know: how many allies have
# fainted, whether a stat was just lowered, who moved first. The stat-stage
# inputs already let you model the outcome by hand - a Defiant Kingambit that
# has been Intimidated is simply one at +2 Attack.
NEEDS_BATTLE_STATE = {
    "analytic", "stakeout", "supreme-overlord", "defiant", "competitive",
    "moxie", "beast-boost", "download", "intrepid-sword", "gorilla-tactics",
    "protosynthesis", "quark-drive", "slow-start", "rivalry", "sniper",
    "victory-star", "flower-gift",
}

UNSUPPORTED_ABILITIES = NEEDS_MOVE_FLAG | NEEDS_BATTLE_STATE


def effective_move_type(move_type: str, attacker_ability: str, move_name: str = "") -> tuple:
    """The type a move actually has once the attacker's ability is applied.

    Returns (type, power_multiplier).
    """
    ability = (attacker_ability or "").lower()

    # Liquid Voice makes every sound move Water - which is what gives
    # Primarina STAB on Hyper Voice. No power boost, unlike the -ate family.
    if ability == "liquid-voice" and is_sound_move(move_name):
        return "water", 1.0

    if ability == NORMALIZE:
        return "normal", ATE_POWER_MULT
    new_type = ATE_ABILITIES.get(ability)
    if new_type and move_type == "normal":
        return new_type, ATE_POWER_MULT
    return move_type, 1.0


def defender_immunity(
    defender_ability: str, move_type: str, type_eff: float, move_name: str = ""
) -> Optional[str]:
    """A reason string if the defender's ability blocks the move entirely."""
    ability = (defender_ability or "").lower()
    if ability == "soundproof" and is_sound_move(move_name):
        return "Soundproof blocks sound-based moves."
    if ability == "bulletproof" and is_bullet_move(move_name):
        return "Bulletproof blocks ball and bomb moves."
    if ability == "overcoat" and is_powder_move(move_name):
        return "Overcoat blocks powder moves."
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


def power_multiplier(
    attacker, move_type: str, move_power: float, weather: str, move_name: str = ""
) -> float:
    """Ability multipliers that apply to the move's power."""
    ability = (attacker.ability or "").lower()
    mult = 1.0

    if ability == "punk-rock" and is_sound_move(move_name):
        mult *= 1.3

    if ability == "sharpness" and is_slicing_move(move_name):
        mult *= 1.5

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


def final_damage_multiplier(
    attacker, defender, move_type: str, move_category: str, type_eff: float, move_name: str = ""
) -> float:
    """Everything applied to the damage after the base calculation."""
    atk_ability = (attacker.ability or "").lower()
    def_ability = (defender.ability or "").lower()
    mult = 1.0

    # Punk Rock cuts incoming sound moves in half as well as boosting its own.
    if def_ability == "punk-rock" and is_sound_move(move_name):
        mult *= 0.5

    # Auras affect both sides' moves of that type, so they're not attacker-
    # or defender-specific.
    mult *= aura_multiplier(atk_ability, def_ability, move_type)

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
    # Marvel Scale trades a status condition for 50% more Defence.
    if (
        def_ability == "marvel-scale"
        and move_category == "physical"
        and defender.status not in ("healthy", "", None)
    ):
        mult *= 1 / 1.5

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
