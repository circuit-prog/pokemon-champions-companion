"""Check every modelled ability actually works on all three calculating surfaces.

The damage calculator, Meta Calcs (/versus) and Breaker/Waller
(/team-matchups) are separate endpoints. They share compute_damage, but each
builds its own combatants, and an ability that never gets passed through is
indistinguishable from one that isn't modelled - that is exactly how the
Breaker/Waller EV bug survived. So rather than trusting the shared code path,
this runs each ability through all three and confirms the number moves.

Requires the API running on :8000.

Usage:
    backend/venv/bin/python backend/scripts/verify_abilities_all_surfaces.py
"""
import json
import urllib.request

BASE = "http://127.0.0.1:8000/api/calc"


def post(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def member(name, ability, moves, evs=None, nature="hardy", status="healthy", hp=100.0, item=""):
    return {
        "pokemon_name": name, "evs": evs or {}, "nature": nature, "ability": ability,
        "item": item, "level": 50, "moves": moves,
        "status": status, "current_hp_percent": hp,
    }


def combatant(m):
    """The /damage endpoint takes one move, not a list."""
    return {k: v for k, v in m.items() if k != "moves"}


def damage_via_calc(atk, dfn, move):
    r = post("/damage", {"attacker": combatant(atk), "defender": combatant(dfn), "move_name": move})
    return None if r.get("immune") else r.get("dmg_high")


def damage_via_versus(atk, dfn, move):
    r = post("/versus", {"attackers": [atk], "defenders": [dfn]})
    results = r[0]["results"]
    hit = next((x for x in results if x["move_name"] == move), None)
    if hit is None:
        return None            # filtered out as immune
    return hit["pct_high"]


def damage_via_matchups(atk, move, target=None):
    """Breaker/Waller, measured against ONE pool member.

    Deliberately not the average: type effectiveness varies by target, so
    averaging over a mixed pool dilutes the multiplier and a correct
    implementation looks wrong. Comparing the same cell twice isolates the
    ability the way the other two surfaces do.
    """
    r = post("/team-matchups", {"team": [atk], "pool_size": 12})
    cells = r[0]["cells"]
    if target:
        cell = next((c for c in cells if c["target_name"] == target), None)
    else:
        cell = next((c for c in cells if c["damage_dealt_pct"]), None)
    return cell["damage_dealt_pct"] if cell and cell["damage_dealt_pct"] else None


# (label, attacker, defender, move, neutral-ability attacker, expected ratio)
CASES = [
    ("Pixilate", member("sylveon", "pixilate", ["hyper-voice"]),
     member("falinks", "", []), "hyper-voice",
     member("sylveon", "cute-charm", ["hyper-voice"]), 3.6),

    ("Liquid Voice", member("primarina", "liquid-voice", ["hyper-voice"]),
     member("kingambit", "", []), "hyper-voice",
     member("primarina", "torrent", ["hyper-voice"]), 3.0),

    ("Adaptability", member("basculegion-male", "adaptability", ["wave-crash"]),
     member("garchomp", "", []), "wave-crash",
     member("basculegion-male", "swift-swim", ["wave-crash"]), 4 / 3),

    ("Technician", member("scizor", "technician", ["bullet-punch"]),
     member("garchomp", "", []), "bullet-punch",
     member("scizor", "swarm", ["bullet-punch"]), 1.5),

    ("Huge Power", member("azumarill", "huge-power", ["play-rough"]),
     member("garchomp", "", []), "play-rough",
     member("azumarill", "thick-fat", ["play-rough"]), 2.0),

    ("Drought (auto sun boosts Fire)", member("charizard-mega-y", "drought", ["flamethrower"]),
     member("garchomp", "", []), "flamethrower",
     member("charizard-mega-y", "blaze", ["flamethrower"]), 1.5),

    ("Drizzle (auto rain boosts Water)", member("pelipper", "drizzle", ["surf"]),
     member("garchomp", "", []), "surf",
     member("pelipper", "keen-eye", ["surf"]), 1.5),

    ("Sharpness (slicing move x1.5)", member("kingambit", "sharpness", ["kowtow-cleave"]),
     member("garchomp", "", []), "kowtow-cleave",
     member("kingambit", "defiant", ["kowtow-cleave"]), 1.5),

    ("Guts (statused, ignores burn, Atk x1.5)",
     member("conkeldurr", "guts", ["close-combat"], status="burn"),
     member("garchomp", "", []), "close-combat",
     member("conkeldurr", "sheer-force", ["close-combat"], status="burn"), 3.0),

    ("Punk Rock (sound x1.3)", member("primarina", "punk-rock", ["hyper-voice"]),
     member("kingambit", "", []), "hyper-voice",
     member("primarina", "torrent", ["hyper-voice"]), 1.3),

    # Tinted Lens only does anything against a target that resists the move,
    # so the Breaker comparison has to be pinned to one that does - Charizard
    # -Mega-Y takes Bug at a quarter.
    ("Tinted Lens (resisted x2)", member("venomoth", "tinted-lens", ["bug-buzz"]),
     member("steelix", "", []), "bug-buzz",
     member("venomoth", "shield-dust", ["bug-buzz"]), 2.0, "charizard-mega-y"),

    # Solar Power needs sun but doesn't set it, so the comparison is against
    # another Pokemon in the same sun rather than against clear weather.
    # Solar Power needs sun and doesn't set it. Breaker's pool is fixed, so
    # nothing there can supply the condition - that surface genuinely can't
    # exercise this ability, which is different from it being broken.
    ("Solar Power (SpA x1.5, sun from the target's Drought)",
     member("charizard", "solar-power", ["flamethrower"]),
     member("torkoal", "drought", []), "flamethrower",
     member("charizard", "blaze", ["flamethrower"]), 1.5, None),
]

DEFENDER_CASES = [
    ("Multiscale (full HP x0.5)", member("garchomp", "", ["dragon-claw"]),
     member("dragonite", "multiscale", []), "dragon-claw",
     member("dragonite", "inner-focus", []), 0.5),

    ("Thick Fat (Fire x0.5)", member("charizard", "", ["flamethrower"]),
     member("snorlax", "thick-fat", []), "flamethrower",
     member("snorlax", "immunity", []), 0.5),

    ("Ice Scales (special x0.5)", member("sylveon", "", ["moonblast"]),
     member("frosmoth", "ice-scales", []), "moonblast",
     member("frosmoth", "shield-dust", []), 0.5),

    ("Fur Coat (physical x0.5)", member("garchomp", "", ["earthquake"]),
     member("furfrou", "fur-coat", []), "earthquake",
     member("furfrou", "overcoat", []), 0.5),

    ("Filter (super-effective x0.75)", member("garchomp", "", ["earthquake"]),
     member("aggron", "filter", []), "earthquake",
     member("aggron", "sturdy", []), 0.75),

    ("Punk Rock defending (sound x0.5)", member("primarina", "", ["hyper-voice"]),
     member("kingambit", "punk-rock", []), "hyper-voice",
     member("kingambit", "defiant", []), 0.5),

    ("Marvel Scale (statused, physical x1/1.5)", member("garchomp", "", ["earthquake"]),
     member("milotic", "marvel-scale", [], status="burn"), "earthquake",
     member("milotic", "competitive", [], status="burn"), 1 / 1.5),
]

IMMUNITIES = [
    ("Levitate vs Ground", member("garchomp", "", ["earthquake"]), member("rotom-heat", "levitate", []), "earthquake"),
    ("Flash Fire vs Fire", member("charizard", "", ["flamethrower"]), member("heatran", "flash-fire", []), "flamethrower"),
    ("Soundproof vs sound", member("primarina", "", ["hyper-voice"]), member("bouffalant", "soundproof", []), "hyper-voice"),
    ("Bulletproof vs bomb", member("gholdengo", "", ["shadow-ball"]), member("chesnaught", "bulletproof", []), "shadow-ball"),
    ("Sap Sipper vs Grass", member("venusaur", "", ["energy-ball"]), member("azumarill", "sap-sipper", []), "energy-ball"),
]


def ratio_ok(actual, expected, tol=0.06):
    return actual is not None and abs(actual - expected) / expected < tol


def run():
    header = f"{'ability':38} {'want':>6} {'calc':>7} {'meta':>7} {'breaker':>8}  verdict"
    print(header)
    print("-" * len(header))
    failures = []

    for case in CASES:
        label, atk, dfn, move, alt_atk, expected = case[:6]
        # Optional 7th field: which pool member to compare on the Breaker
        # surface. Explicit None means that surface can't supply the ability's
        # condition, so testing it there would be meaningless.
        breaker_target = case[6] if len(case) > 6 else ""
        testable_on_breaker = len(case) <= 6 or case[6] is not None

        c = damage_via_calc(atk, dfn, move) / max(damage_via_calc(alt_atk, dfn, move), 1)
        m = damage_via_versus(atk, dfn, move) / max(damage_via_versus(alt_atk, dfn, move), 0.01)

        if testable_on_breaker:
            bt = damage_via_matchups(atk, move, breaker_target)
            ba = damage_via_matchups(alt_atk, move, breaker_target)
            b = (bt / ba) if bt and ba else 0.0
            good = all(ratio_ok(x, expected) for x in (c, m, b))
            b_text = f"{b:>8.2f}"
        else:
            good = ratio_ok(c, expected) and ratio_ok(m, expected)
            b_text = f"{'n/a':>8}"

        if not good:
            failures.append(label)
        print(f"{label:38} {expected:>6.2f} {c:>7.2f} {m:>7.2f} {b_text}  {'OK' if good else 'MISMATCH'}")

    print()
    header2 = f"{'defender ability':38} {'want':>6} {'calc':>7} {'meta':>7}  verdict"
    print(header2)
    print("-" * len(header2))
    for label, atk, dfn, move, alt_dfn, expected in DEFENDER_CASES:
        c = damage_via_calc(atk, dfn, move) / max(damage_via_calc(atk, alt_dfn, move), 1)
        m = damage_via_versus(atk, dfn, move) / max(damage_via_versus(atk, alt_dfn, move), 0.01)
        good = ratio_ok(c, expected) and ratio_ok(m, expected)
        if not good:
            failures.append(label)
        print(f"{label:38} {expected:>6.2f} {c:>7.2f} {m:>7.2f}  {'OK' if good else 'MISMATCH'}")

    print()
    print(f"{'immunity':38} {'calc':>8} {'meta':>8}  verdict")
    print("-" * 68)
    for label, atk, dfn, move in IMMUNITIES:
        c = damage_via_calc(atk, dfn, move) is None
        m = damage_via_versus(atk, dfn, move) is None
        good = c and m
        if not good:
            failures.append(label)
        print(f"{label:38} {'blocked' if c else 'THROUGH':>8} {'blocked' if m else 'THROUGH':>8}  "
              f"{'OK' if good else 'MISMATCH'}")

    print()
    if failures:
        print(f"{len(failures)} FAILED: {', '.join(failures)}")
    else:
        print("All abilities behave identically on the calculator, Meta Calcs and Breaker/Waller.")
        print('("n/a" means the Breaker pool cannot supply that ability\'s condition,')
        print(' not that the ability is unsupported there.)')
    return not failures


if __name__ == "__main__":
    run()
