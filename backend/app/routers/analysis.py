"""Deep meta analysis: for each of the top-N Pokemon, run its four most-used
damaging moves against every other Pokemon in the pool (each built the way it
is actually run - top ability, item, nature and EV spread), and every other
Pokemon's best move back at it. Also tags which team archetypes it normally
shows up on.

Everything here is derived from data the app already holds (usage rows,
tournament rosters) and the same compute_damage the calculator uses, so the
numbers match what the Calculator and Meta Calcs tabs would show for the same
sets. Read-only; nothing is stored. The full matrix takes a few seconds, so
the result is cached in memory and rebuilt when the usage data changes.
"""
import json
import time
from collections import Counter
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.damage_calc import compute_damage
from app.database import get_db
from app.models.pokemon import PokemonUsageStats
from app.models.tournament import TournamentResult
from app.routers.calc import _build_combatant, _resolve_top_set
from app.routers.tournaments import _team_archetypes

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

MAX_MOVES = 4
DEFAULT_POOL = 100
MAX_POOL = 150
SPREAD_ORDER = ["hp", "atk", "def", "spa", "spd", "spe"]

# pool size + data signature -> computed analysis. Small (one entry per pool
# size actually requested), so no eviction needed.
_CACHE: Dict[tuple, dict] = {}


def _pretty(slug: Optional[str]) -> str:
    return (slug or "").replace("-", " ").title()


class _Member:
    """One pool Pokemon: its resolved set plus a ready-to-use Combatant."""

    def __init__(self, db: Session, row: PokemonUsageStats):
        p = row.pokemon
        self.row = row
        self.pokemon = p
        self.rank = row.rank
        self.usage = row.usage_percent or 0.0

        _, self.ability, self.item = _resolve_top_set(db, row)
        spreads = json.loads(row.spreads_json or "[]")
        top = spreads[0] if spreads else {}
        self.nature = top.get("nature", "hardy")
        self.evs = top.get("evs", {})
        self.has_spread = bool(spreads)
        self.combatant = _build_combatant(
            p, evs=self.evs, nature=self.nature, ability=self.ability, item=self.item,
        )

        # Top four *damaging* moves by usage. Status moves (Protect, Fake Out
        # is damaging but Tailwind isn't) are listed separately as utility,
        # since they tell you nothing about damage output.
        self.moves = []
        self.utility = []
        by_display = {m.display_name.lower(): m for m in p.moves}
        for entry in json.loads(row.moves_json or "[]"):
            mv = by_display.get(entry["name"].lower())
            if mv is None:
                continue
            if mv.category != "status" and mv.power:
                if len(self.moves) < MAX_MOVES:
                    self.moves.append((mv, entry["percent"]))
            else:
                self.utility.append({"name": mv.name, "display_name": mv.display_name,
                                     "percent": entry["percent"]})

    @property
    def speed(self) -> int:
        return self.combatant.stat("spe")


def _signature(rows) -> tuple:
    return (len(rows), sum(r.pokemon_id for r in rows),
            round(sum((r.usage_percent or 0) for r in rows), 2))


def _archetype_shares(db: Session, names: set) -> Dict[str, dict]:
    """Per Pokemon: how many logged tournament teams carry it, and which
    archetype tags those teams earn. Heuristic, same rules as the Tournaments
    tab (a team earns a tag if any member has the ability/move)."""
    appearances: Counter = Counter()
    tag_counts: Dict[str, Counter] = {n: Counter() for n in names}
    for r in db.query(TournamentResult).all():
        roster = json.loads(r.roster_json)
        tags = _team_archetypes(roster)
        for slot in roster:
            n = slot.get("pokemon_name")
            if n in names:
                appearances[n] += 1
                for t in tags:
                    tag_counts[n][t] += 1
    out = {}
    for n in names:
        total = appearances[n]
        out[n] = {
            "teams": total,
            "tags": [
                {"tag": t, "percent": round(100 * c / total, 1)}
                for t, c in tag_counts[n].most_common() if total
            ],
        }
    return out


def _compute(db: Session, pool: int) -> dict:
    rows = (
        db.query(PokemonUsageStats)
        .order_by(PokemonUsageStats.rank)
        .limit(pool)
        .all()
    )
    rows = [r for r in rows if r.pokemon]
    key = (pool, _signature(rows))
    if key in _CACHE:
        return _CACHE[key]

    started = time.time()
    members = [_Member(db, r) for r in rows]
    field = {}  # plain singles hit, no weather/terrain/crit beyond what abilities set

    # dealt[(a, d)] -> list of (move_idx, result) for a's moves vs d
    # Stored per attacker index then defender index.
    n = len(members)
    dealt: List[List[Optional[list]]] = [[None] * n for _ in range(n)]
    for ai, a in enumerate(members):
        for di, d in enumerate(members):
            if ai == di:
                continue
            per_move = []
            for mi, (mv, _pct) in enumerate(a.moves):
                res = compute_damage(
                    a.combatant, d.combatant,
                    move={"name": mv.name, "type": mv.type, "category": mv.category, "power": mv.power},
                    field=field,
                )
                if res.get("error"):
                    per_move.append(None)
                elif res.get("immune"):
                    per_move.append({"immune": True, "pct_low": 0.0, "pct_high": 0.0, "ko_text": "Immune"})
                else:
                    per_move.append({"immune": False, "pct_low": res["pct_low"],
                                     "pct_high": res["pct_high"], "ko_text": res.get("ko_text")})
            dealt[ai][di] = per_move

    def best_vs(ai: int, di: int):
        """a's strongest move against d: (move_idx, result) or None."""
        best = None
        for mi, r in enumerate(dealt[ai][di] or []):
            if r and (best is None or r["pct_high"] > best[1]["pct_high"]):
                best = (mi, r)
        return best

    speeds = [m.speed for m in members]
    arche = _archetype_shares(db, {m.pokemon.name for m in members})
    total_usage = sum(m.usage for m in members) or 1.0

    entries = []
    for ai, a in enumerate(members):
        # --- damage dealt, per move ---
        move_out = []
        for mi, (mv, usage_pct) in enumerate(a.moves):
            cells = [(di, dealt[ai][di][mi]) for di in range(n) if di != ai and dealt[ai][di] and dealt[ai][di][mi]]
            wsum = sum(members[di].usage for di, _ in cells) or 1.0
            avg = sum(min(r["pct_high"], 100) * members[di].usage for di, r in cells) / wsum
            top = sorted(cells, key=lambda c: -c[1]["pct_high"])[:5]
            move_out.append({
                "name": mv.name, "display_name": mv.display_name, "type": mv.type,
                "category": mv.category, "power": mv.power, "usage_percent": usage_pct,
                "avg_pct": round(avg, 1),
                "ohko": sum(1 for _, r in cells if r["pct_low"] >= 100),
                "possible_ohko": sum(1 for _, r in cells if r["pct_high"] >= 100),
                "two_hit": sum(1 for _, r in cells if r["pct_low"] >= 50),
                "immune": sum(1 for _, r in cells if r["immune"]),
                "targets": len(cells),
                "best_targets": [
                    {"pokemon_name": members[di].pokemon.name, "display_name": members[di].pokemon.display_name,
                     "sprite_url": members[di].pokemon.sprite_url, "pct_low": r["pct_low"], "pct_high": r["pct_high"]}
                    for di, r in top
                ],
            })

        # --- overall offence: best move against each target ---
        best_cells = [(di, best_vs(ai, di)) for di in range(n) if di != ai]
        best_cells = [(di, b) for di, b in best_cells if b]
        wsum = sum(members[di].usage for di, _ in best_cells) or 1.0
        # Averages cap each matchup at 100%: a 400% hit is one KO, not four,
        # and uncapped overkill would let one lopsided matchup dominate.
        off_avg = sum(min(b[1]["pct_high"], 100) * members[di].usage for di, b in best_cells) / wsum

        # --- damage taken: every other Pokemon's best move at this one ---
        taken = []
        for oi in range(n):
            if oi == ai:
                continue
            b = best_vs(oi, ai)
            if b:
                mv = members[oi].moves[b[0]][0]
                taken.append((oi, mv, b[1]))
        tw = sum(members[oi].usage for oi, _, _ in taken) or 1.0
        taken_avg = sum(min(r["pct_high"], 100) * members[oi].usage for oi, _, r in taken) / tw
        worst = sorted(taken, key=lambda t: -t[2]["pct_high"])[:5]

        outsped = sum(1 for oi in range(n) if oi != ai and speeds[ai] > speeds[oi])
        outspeeds_me = sum(1 for oi in range(n) if oi != ai and speeds[oi] > speeds[ai])
        spe_rank = 1 + sum(1 for s in speeds if s > speeds[ai])
        p = a.pokemon
        arch = arche[p.name]
        entries.append({
            "rank": a.rank, "pokemon_name": p.name, "display_name": p.display_name,
            "sprite_url": p.sprite_url, "types": [t for t in (p.type1, p.type2) if t],
            "usage_percent": a.usage,
            "ability": _pretty(a.ability), "item": _pretty(a.item), "nature": _pretty(a.nature),
            "spread": "/".join(str(a.evs.get(k, 0)) for k in SPREAD_ORDER),
            "has_spread": a.has_spread,
            "stats": {k: a.combatant.stat(k) for k in SPREAD_ORDER},
            "speed_rank": spe_rank, "outspeeds": outsped, "outsped_by": outspeeds_me,
            "moves": move_out, "utility_moves": a.utility[:4],
            "offence": {
                "avg_best_pct": round(off_avg, 1),
                "ohko": sum(1 for _, b in best_cells if b[1]["pct_low"] >= 100),
                "possible_ohko": sum(1 for _, b in best_cells if b[1]["pct_high"] >= 100),
                "two_hit": sum(1 for _, b in best_cells if b[1]["pct_low"] >= 50),
                "targets": len(best_cells),
            },
            "defence": {
                "avg_taken_pct": round(taken_avg, 1),
                "ohko_by": sum(1 for _, _, r in taken if r["pct_low"] >= 100),
                "possible_ohko_by": sum(1 for _, _, r in taken if r["pct_high"] >= 100),
                "two_hit_by": sum(1 for _, _, r in taken if r["pct_low"] >= 50),
                "attackers": len(taken),
                "worst_threats": [
                    {"pokemon_name": members[oi].pokemon.name, "display_name": members[oi].pokemon.display_name,
                     "sprite_url": members[oi].pokemon.sprite_url, "move": mv.display_name,
                     "pct_low": r["pct_low"], "pct_high": r["pct_high"]}
                    for oi, mv, r in worst
                ],
            },
            "archetypes": arch["tags"][:6], "archetype_teams": arch["teams"],
        })

    result = {
        "pool_size": n,
        "generated_at": int(time.time()),
        "compute_seconds": round(time.time() - started, 2),
        "entries": entries,
        "_members": members, "_dealt": dealt, "_best_vs": best_vs,
    }
    _CACHE[key] = result
    return result


def _public(result: dict) -> dict:
    return {k: v for k, v in result.items() if not k.startswith("_")}


@router.get("/meta")
def get_meta_analysis(pool: int = DEFAULT_POOL, db: Session = Depends(get_db)):
    """Summary table for the top `pool` Pokemon (default 100)."""
    pool = max(5, min(pool, MAX_POOL))
    return _public(_compute(db, pool))


@router.get("/pokemon/{name}")
def get_pokemon_analysis(name: str, pool: int = DEFAULT_POOL, db: Session = Depends(get_db)):
    """Full breakdown for one pool member: each move against every target, and
    every other Pokemon's best move back at it."""
    pool = max(5, min(pool, MAX_POOL))
    result = _compute(db, pool)
    members = result["_members"]
    dealt = result["_dealt"]
    best_vs = result["_best_vs"]
    ai = next((i for i, m in enumerate(members) if m.pokemon.name == name.lower()), None)
    if ai is None:
        raise HTTPException(status_code=404, detail=f"'{name}' is not in the top {pool}")
    a = members[ai]
    summary = next(e for e in result["entries"] if e["pokemon_name"] == a.pokemon.name)

    def ref(m: "_Member"):
        return {"pokemon_name": m.pokemon.name, "display_name": m.pokemon.display_name,
                "sprite_url": m.pokemon.sprite_url, "rank": m.rank}

    dealt_out = []
    for mi, (mv, usage_pct) in enumerate(a.moves):
        rows = []
        for di, d in enumerate(members):
            if di == ai or not dealt[ai][di] or not dealt[ai][di][mi]:
                continue
            r = dealt[ai][di][mi]
            rows.append({**ref(d), "pct_low": r["pct_low"], "pct_high": r["pct_high"],
                         "ko_text": r["ko_text"], "immune": r["immune"]})
        rows.sort(key=lambda x: -x["pct_high"])
        dealt_out.append({"name": mv.name, "display_name": mv.display_name, "type": mv.type,
                          "usage_percent": usage_pct, "targets": rows})

    taken_out = []
    for oi, o in enumerate(members):
        if oi == ai:
            continue
        b = best_vs(oi, ai)
        if not b:
            continue
        mv = o.moves[b[0]][0]
        taken_out.append({**ref(o), "move": mv.display_name, "pct_low": b[1]["pct_low"],
                          "pct_high": b[1]["pct_high"], "ko_text": b[1]["ko_text"],
                          "faster": o.speed > a.speed})
    taken_out.sort(key=lambda x: -x["pct_high"])

    return {"summary": summary, "dealt": dealt_out, "taken": taken_out}
