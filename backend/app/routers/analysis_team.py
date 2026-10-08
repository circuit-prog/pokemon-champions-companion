"""Team analysis: one saved team measured against the top-N meta pool.

Sits beside analysis.py (the pool-vs-pool matrix) and reuses its cached pool
so a team report doesn't recompute the whole meta. Everything is derived from
the same compute_damage the calculator uses.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.damage_calc import TYPE_CHART, compute_damage, type_effectiveness
from app.database import get_db
from app.models.pokemon import Move, Pokemon
from app.routers.analysis import DEFAULT_POOL, MAX_POOL, SPREAD_ORDER, _compute, _pretty
from app.routers.calc import _build_combatant
from app.routers.tournaments import _team_archetypes
from app.schemas import TeamMemberIn

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


class TeamAnalysisRequest(BaseModel):
    team: List[TeamMemberIn]
    pool: int = DEFAULT_POOL


# Ability -> the one attacking type it makes the holder immune to.
ABILITY_IMMUNITY = {
    "levitate": "ground", "earth-eater": "ground",
    "flash-fire": "fire", "well-baked-body": "fire",
    "water-absorb": "water", "storm-drain": "water", "dry-skin": "water",
    "volt-absorb": "electric", "lightning-rod": "electric", "motor-drive": "electric",
    "sap-sipper": "grass",
}

SPEED_CONTROL = {"tailwind", "trick-room", "icy-wind", "electroweb", "thunder-wave",
                 "bulldoze", "rock-tomb", "glare", "scary-face", "string-shot"}
REDIRECTION = {"follow-me", "rage-powder", "spotlight", "ally-switch"}
FAKE_OUT_LIKE = {"fake-out", "first-impression"}
PROTECT_LIKE = {"protect", "detect", "spiky-shield", "baneful-bunker", "king-s-shield", "silk-trap",
                "burning-bulwark", "obstruct", "wide-guard"}
WEATHER_ABILITIES = {"drought", "drizzle", "sand-stream", "snow-warning", "orichalcum-pulse",
                     "desolate-land", "primordial-sea"}
TERRAIN_ABILITIES = {"electric-surge", "grassy-surge", "misty-surge", "psychic-surge", "hadron-engine"}


def _type_row(types: list, ability: str) -> dict:
    """Multiplier of every attacking type against this typing (+ ability immunity)."""
    row = {}
    for atk in TYPE_CHART:
        m = type_effectiveness(atk, [t for t in types if t])
        if ABILITY_IMMUNITY.get(ability or "") == atk:
            m = 0.0
        row[atk] = m
    return row


def _hit(attacker, defender, mv):
    res = compute_damage(
        attacker, defender,
        move={"name": mv.name, "type": mv.type, "category": mv.category, "power": mv.power},
        field={},
    )
    if res.get("error"):
        return None
    if res.get("immune"):
        return {"pct_low": 0.0, "pct_high": 0.0, "ko_text": "Immune", "immune": True}
    return {"pct_low": res["pct_low"], "pct_high": res["pct_high"],
            "ko_text": res.get("ko_text"), "immune": False}


def _ref(p):
    return {"pokemon_name": p.name, "display_name": p.display_name, "sprite_url": p.sprite_url}


@router.post("/team")
def analyse_team(req: TeamAnalysisRequest, db: Session = Depends(get_db)):
    pool = max(5, min(req.pool, MAX_POOL))
    if not req.team:
        raise HTTPException(status_code=400, detail="Team is empty")

    members = _compute(db, pool)["_members"]

    mine = []
    for spec in req.team[:6]:
        p = db.query(Pokemon).filter(Pokemon.name == spec.pokemon_name.lower().replace(" ", "-")).first()
        if not p:
            raise HTTPException(status_code=404, detail=f"Pokemon '{spec.pokemon_name}' not found")
        c = _build_combatant(p, evs=spec.evs, nature=spec.nature, ability=spec.ability or "",
                             item=spec.item or "", level=spec.level)
        move_rows = db.query(Move).filter(Move.name.in_(spec.moves)).all() if spec.moves else []
        order = {n: i for i, n in enumerate(spec.moves)}
        move_rows.sort(key=lambda m: order.get(m.name, 99))
        mine.append({"p": p, "c": c, "spec": spec, "moves": move_rows})

    member_out = []
    best_on_target = [None] * len(members)   # best team damage per pool target
    threat_hits = [[] for _ in members]      # per pool target: which of my members it hurts
    speeds = [m.speed for m in members]

    for m in mine:
        dmg_moves = [mv for mv in m["moves"] if mv.category != "status" and mv.power]
        move_rows_out = []
        per_target_best = [None] * len(members)
        for mv in dmg_moves:
            cells = []
            for ti, t in enumerate(members):
                r = _hit(m["c"], t.combatant, mv)
                if not r:
                    continue
                cells.append((ti, r))
                if per_target_best[ti] is None or r["pct_high"] > per_target_best[ti][0]["pct_high"]:
                    per_target_best[ti] = (r, mv)
            wsum = sum(members[ti].usage for ti, _ in cells) or 1.0
            top = sorted(cells, key=lambda c: -c[1]["pct_high"])[:5]
            move_rows_out.append({
                "name": mv.name, "display_name": mv.display_name, "type": mv.type,
                "category": mv.category, "power": mv.power,
                "avg_pct": round(sum(min(r["pct_high"], 100) * members[ti].usage for ti, r in cells) / wsum, 1),
                "ohko": sum(1 for _, r in cells if r["pct_low"] >= 100),
                "possible_ohko": sum(1 for _, r in cells if r["pct_high"] >= 100),
                "two_hit": sum(1 for _, r in cells if r["pct_low"] >= 50),
                "immune": sum(1 for _, r in cells if r["immune"]),
                "targets": len(cells),
                "best_targets": [{**_ref(members[ti].pokemon), "pct_low": r["pct_low"], "pct_high": r["pct_high"]}
                                 for ti, r in top],
            })
        for ti, b in enumerate(per_target_best):
            if b and (best_on_target[ti] is None or b[0]["pct_high"] > best_on_target[ti]["pct_high"]):
                best_on_target[ti] = {**b[0], "by": m["p"].display_name, "move": b[1].display_name}

        # Damage taken: each pool member's best move into this one.
        taken = []
        for ti, t in enumerate(members):
            best = None
            for mv, _ in t.moves:
                r = _hit(t.combatant, m["c"], mv)
                if r and (best is None or r["pct_high"] > best[0]["pct_high"]):
                    best = (r, mv)
            if best:
                taken.append((ti, best[1], best[0]))
                if best[0]["pct_low"] >= 50:
                    threat_hits[ti].append((m["p"].display_name, best[0]["pct_low"] >= 100))
        tw = sum(members[ti].usage for ti, _, _ in taken) or 1.0
        worst = sorted(taken, key=lambda x: -x[2]["pct_high"])[:5]
        spd = m["c"].stat("spe")
        member_out.append({
            **_ref(m["p"]),
            "types": [t for t in (m["p"].type1, m["p"].type2) if t],
            "ability": _pretty(m["spec"].ability), "item": _pretty(m["spec"].item),
            "nature": _pretty(m["spec"].nature),
            "spread": "/".join(str((m["spec"].evs or {}).get(k, 0)) for k in SPREAD_ORDER),
            "stats": {k: m["c"].stat(k) for k in SPREAD_ORDER},
            "speed_outspeeds": sum(1 for s in speeds if spd > s),
            "speed_outsped_by": sum(1 for s in speeds if s > spd),
            "move_names": [mv.display_name for mv in m["moves"]],
            "moves": move_rows_out,
            "defence": {
                "avg_taken_pct": round(sum(min(r["pct_high"], 100) * members[ti].usage for ti, _, r in taken) / tw, 1),
                "ohko_by": sum(1 for _, _, r in taken if r["pct_low"] >= 100),
                "two_hit_by": sum(1 for _, _, r in taken if r["pct_low"] >= 50),
                "attackers": len(taken),
                "worst_threats": [{**_ref(members[ti].pokemon), "move": mv.display_name,
                                   "pct_low": r["pct_low"], "pct_high": r["pct_high"]}
                                  for ti, mv, r in worst],
            },
        })

    # Type chart: how many of my Pokemon are weak / resist / immune to each type.
    rows = [_type_row([m["p"].type1, m["p"].type2], m["spec"].ability or "") for m in mine]
    type_chart = []
    for atk in TYPE_CHART:
        weak = sum(1 for r in rows if r[atk] > 1)
        resist = sum(1 for r in rows if 0 < r[atk] < 1)
        immune = sum(1 for r in rows if r[atk] == 0)
        type_chart.append({"type": atk, "weak": weak, "resist": resist, "immune": immune,
                           "quad": sum(1 for r in rows if r[atk] >= 4),
                           "net": weak - resist - immune})
    type_chart.sort(key=lambda t: (-t["net"], t["type"]))

    # Coverage: best damage the team as a whole can put on each pool member.
    gaps = sorted(
        [(ti, b) for ti, b in enumerate(best_on_target) if not b or b["pct_high"] < 50],
        key=lambda x: members[x[0]].rank,
    )[:12]
    coverage = {
        "targets": len(members),
        "guaranteed_ohko": sum(1 for b in best_on_target if b and b["pct_low"] >= 100),
        "two_hit_or_better": sum(1 for b in best_on_target if b and b["pct_low"] >= 50),
        "gaps": [{**_ref(members[ti].pokemon), "rank": members[ti].rank,
                  "best_pct": (b["pct_high"] if b else 0), "best_by": (b["by"] if b else None),
                  "best_move": (b["move"] if b else None)} for ti, b in gaps],
    }

    # Pool members that put at least a 2HKO on two or more of my Pokemon.
    threats = []
    for ti, hits in enumerate(threat_hits):
        if len(hits) >= 2:
            threats.append({**_ref(members[ti].pokemon), "rank": members[ti].rank,
                            "hits": len(hits), "ohkos": sum(1 for _, ko in hits if ko),
                            "targets": [n for n, _ in hits],
                            "faster_than": sum(1 for m in mine if members[ti].speed > m["c"].stat("spe"))})
    threats.sort(key=lambda t: (-t["ohkos"], -t["hits"], t["rank"]))

    all_moves = {mv.name for m in mine for mv in m["moves"]}
    abilities = {(m["spec"].ability or "") for m in mine}
    roles = [
        {"role": "Speed control", "have": sorted(_pretty(x) for x in all_moves & SPEED_CONTROL)},
        {"role": "Fake Out", "have": sorted(_pretty(x) for x in all_moves & FAKE_OUT_LIKE)},
        {"role": "Redirection", "have": sorted(_pretty(x) for x in all_moves & REDIRECTION)},
        {"role": "Protect", "have": [m["p"].display_name for m in mine
                                     if {mv.name for mv in m["moves"]} & PROTECT_LIKE]},
        {"role": "Weather", "have": sorted(_pretty(x) for x in abilities & WEATHER_ABILITIES)},
        {"role": "Terrain", "have": sorted(_pretty(x) for x in abilities & TERRAIN_ABILITIES)},
        {"role": "Intimidate", "have": [m["p"].display_name for m in mine
                                        if (m["spec"].ability or "") == "intimidate"]},
    ]

    roster = [{"ability": m["spec"].ability or "", "moves": [mv.name for mv in m["moves"]]} for m in mine]
    return {
        "pool_size": len(members),
        "members": member_out,
        "type_chart": type_chart,
        "coverage": coverage,
        "threats": threats[:10],
        "roles": roles,
        "archetypes": _team_archetypes(roster),
        "members_without_moves": [m["p"].display_name for m in mine if not m["moves"]],
    }
