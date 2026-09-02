"""Check each modelled ability changes damage by the amount it should.

Exists because abilities were silently missing from the calculator: a Pixilate
Sylveon's Hyper Voice read 37% where Showdown said 141%, because we never
converted the move's type. A wrong damage number is worse than no damage
number, so this pins the behaviour down.

Each case runs the same calc twice - once with the ability, once with a
neutral one - and compares the ratio against what the ability should do. That
catches an ability being ignored (ratio 1.0) or applied at the wrong strength
without needing an external calculator for every case. The absolute arithmetic
is anchored separately: a Pixilate Sylveon (Modest, Fairy Feather,
25/0/24/12/0/5) Hyper Voice into a 2 HP Falinks-Mega in doubles gives 200-236,
matching Showdown exactly.

Requires the API running on :8000.

Usage:
    backend/venv/bin/python backend/scripts/verify_damage_calc.py
"""
import json
import urllib.request

API = "http://127.0.0.1:8000/api/calc/damage"


def calc(attacker, defender, move, field=None):
    body = json.dumps({
        "attacker": attacker, "defender": defender,
        "move_name": move, "field": field or {},
    }).encode()
    req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def mon(name, ability="", item="", evs=None, nature="hardy", status="healthy", hp=100.0):
    return {
        "pokemon_name": name, "evs": evs or {}, "nature": nature,
        "ability": ability, "item": item, "level": 50,
        "status": status, "current_hp_percent": hp,
    }


CASES = [
    # (label, attacker, defender, move, field, expected ratio vs baseline)
    ("Pixilate (Normal -> Fairy, x1.2 + STAB + 2x on Fighting)",
     mon("sylveon", "pixilate"), mon("falinks", ""), "hyper-voice", None,
     mon("sylveon", "cute-charm"), 3.6),

    ("Adaptability (STAB 1.5 -> 2.0)",
     mon("basculegion-male", "adaptability"), mon("garchomp", ""), "wave-crash", None,
     mon("basculegion-male", "swift-swim"), 4 / 3),

    ("Technician (<=60 BP x1.5)",
     mon("scizor", "technician"), mon("garchomp", ""), "bullet-punch", None,
     mon("scizor", "swarm"), 1.5),

    ("Huge Power (Attack x2)",
     mon("azumarill", "huge-power"), mon("garchomp", ""), "play-rough", None,
     mon("azumarill", "thick-fat"), 2.0),

    # Dragon Claw, not Earthquake: Dragonite is Dragon/Flying, so Ground is a
    # type immunity and would never reach the Multiscale check.
    ("Multiscale at full HP (x0.5)",
     mon("garchomp", ""), mon("dragonite", "multiscale", hp=100.0), "dragon-claw", None,
     None, 0.5, mon("dragonite", "inner-focus", hp=100.0)),

    ("Multiscale below full HP (no reduction)",
     mon("garchomp", ""), mon("dragonite", "multiscale", hp=99.0), "dragon-claw", None,
     None, 1.0, mon("dragonite", "inner-focus", hp=99.0)),

    ("Thick Fat vs Fire (x0.5)",
     mon("charizard", ""), mon("snorlax", "thick-fat"), "flamethrower", None,
     None, 0.5, mon("snorlax", "immunity")),

    ("Filter vs super-effective (x0.75)",
     mon("garchomp", ""), mon("aggron", "filter"), "earthquake", None,
     None, 0.75, mon("aggron", "sturdy")),

    ("Ice Scales vs special (x0.5)",
     mon("sylveon", ""), mon("frosmoth", "ice-scales"), "moonblast", None,
     None, 0.5, mon("frosmoth", "shield-dust")),

    ("Fur Coat vs physical (x0.5)",
     mon("garchomp", ""), mon("furfrou", "fur-coat"), "earthquake", None,
     None, 0.5, mon("furfrou", "overcoat")),

    ("Tinted Lens vs resisted (x2)",
     mon("venomoth", "tinted-lens"), mon("steelix", ""), "bug-buzz", None,
     mon("venomoth", "shield-dust"), 2.0),

    ("Black Glasses on a Dark move (x1.2)",
     mon("kingambit", "defiant", item="black-glasses"), mon("garchomp", ""), "kowtow-cleave", None,
     mon("kingambit", "defiant"), 1.2),

    # Sound-move abilities. Liquid Voice is the reason Primarina's Hyper Voice
    # hits like a STAB Water move rather than a resisted Normal one.
    ("Liquid Voice (sound move -> Water, gains STAB on Primarina)",
     mon("primarina", "liquid-voice"), mon("kingambit", ""), "hyper-voice", None,
     mon("primarina", "torrent"), 3.0),

    ("Liquid Voice leaves a non-sound move alone",
     mon("primarina", "liquid-voice"), mon("kingambit", ""), "moonblast", None,
     mon("primarina", "torrent"), 1.0),

    ("Punk Rock boosts its own sound moves (x1.3)",
     mon("primarina", "punk-rock"), mon("kingambit", ""), "hyper-voice", None,
     mon("primarina", "torrent"), 1.3),

    ("Punk Rock halves incoming sound moves (x0.5)",
     mon("primarina", "torrent"), mon("kingambit", "punk-rock"), "hyper-voice", None,
     None, 0.5, mon("kingambit", "defiant")),

    ("Guts through a burn (no halving, plus x1.5)",
     mon("conkeldurr", "guts", status="burn"), mon("garchomp", ""), "close-combat", None,
     mon("conkeldurr", "sheer-force", status="burn"), 3.0),
]


IMMUNITY_CASES = [
    ("Levitate blocks Ground", mon("garchomp", ""), mon("rotom-heat", "levitate"), "earthquake"),
    ("Flash Fire blocks Fire", mon("charizard", ""), mon("heatran", "flash-fire"), "flamethrower"),
    ("Volt Absorb blocks Electric", mon("pikachu", ""), mon("lanturn", "volt-absorb"), "thunderbolt"),
    ("Sap Sipper blocks Grass", mon("venusaur", ""), mon("azumarill", "sap-sipper"), "energy-ball"),
    ("Storm Drain blocks Water", mon("pelipper", ""), mon("gastrodon", "storm-drain"), "surf"),
    ("Soundproof blocks a sound move", mon("primarina", ""), mon("bouffalant", "soundproof"), "hyper-voice"),
]


def run_immunities():
    print()
    print("immunity abilities")
    print("-" * 95)
    for label, atk, dfn, move in IMMUNITY_CASES:
        r = calc(atk, dfn, move)
        blocked = bool(r.get("immune"))
        print(f"{label:62} {'blocked' if blocked else 'NOT BLOCKED':>18}  {'OK' if blocked else 'MISMATCH'}")


def run():
    print(f"{'case':62} {'expected':>9} {'actual':>8}  verdict")
    print("-" * 95)
    ok = True
    for case in CASES:
        label, atk, dfn, move, field, alt, expected = case[:7]
        alt_def = case[7] if len(case) > 7 else None

        with_ability = calc(atk, dfn, move, field)
        if alt_def is not None:
            without = calc(atk, alt_def, move, field)
        else:
            without = calc(alt, dfn, move, field)

        if with_ability.get("immune") or without.get("immune"):
            print(f"{label:62} {'immune':>9} {'-':>8}  (immunity path)")
            continue
        if not with_ability.get("dmg_high") or not without.get("dmg_high"):
            print(f"{label:62} {'?':>9} {'?':>8}  ERROR {with_ability.get('error') or without.get('error')}")
            ok = False
            continue

        ratio = with_ability["dmg_high"] / without["dmg_high"]
        close = abs(ratio - expected) / expected < 0.04
        ok = ok and close
        print(f"{label:62} {expected:>9.2f} {ratio:>8.2f}  {'OK' if close else 'MISMATCH'}")
    return ok


if __name__ == "__main__":
    run()
    run_immunities()
