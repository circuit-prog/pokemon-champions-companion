import { useEffect, useState } from "react";
import { calcDamage } from "../api";
import type { SavedTeam } from "../teamStorage";
import { loadMetaPool } from "../metaPool";
import type { MetaPoolEntry } from "../metaPool";
import "./BreakerPanel.css";

const POOL_SIZE = 10;

interface BreakerScore {
  name: string;
  sprite: string | null;
  bestMove: string;
  avgPct: number;
}

export default function BreakerPanel({ team }: { team: SavedTeam }) {
  const [scores, setScores] = useState<BreakerScore[] | null>(null);
  const [pool, setPool] = useState<MetaPoolEntry[] | null>(null);

  useEffect(() => {
    loadMetaPool(POOL_SIZE).then(setPool);
  }, []);

  useEffect(() => {
    if (!pool) return;
    let cancelled = false;

    async function run() {
      const results: BreakerScore[] = [];
      for (const slot of team.slots) {
        const damagingMoves = slot.pokemon.moves.filter((m) => slot.moves.includes(m.name) && m.category !== "status" && m.power);
        if (damagingMoves.length === 0) continue;

        // For each meta target, find this Pokemon's single best move against it, then average those bests.
        const perTargetBest = await Promise.all(
          pool!.map(async (target) => {
            const results = await Promise.all(
              damagingMoves.map((move) =>
                calcDamage(
                  { pokemon_name: slot.pokemon.name, evs: slot.evs, nature: slot.nature, ability: slot.ability, item: slot.item, level: 50 },
                  { pokemon_name: target.pokemon.name, evs: {}, nature: "hardy", ability: target.topAbility, level: 50 },
                  move.name
                ).then((r) => ({ move, r })).catch(() => null)
              )
            );
            const valid = results.filter((x): x is { move: typeof damagingMoves[0]; r: Awaited<ReturnType<typeof calcDamage>> } => x !== null && !x.r.error && !x.r.immune);
            if (valid.length === 0) return null;
            valid.sort((a, b) => (b.r.pct_high ?? 0) - (a.r.pct_high ?? 0));
            return valid[0];
          })
        );

        const valid = perTargetBest.filter((x): x is NonNullable<typeof x> => x !== null);
        if (valid.length === 0) continue;
        const avgPct = valid.reduce((sum, x) => sum + (x.r.pct_high ?? 0), 0) / valid.length;
        const moveCounts = new Map<string, number>();
        valid.forEach((x) => moveCounts.set(x.move.display_name, (moveCounts.get(x.move.display_name) ?? 0) + 1));
        const bestMove = [...moveCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

        results.push({ name: slot.pokemon.display_name, sprite: slot.pokemon.sprite_url, bestMove, avgPct });
      }
      results.sort((a, b) => b.avgPct - a.avgPct);
      if (!cancelled) setScores(results);
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, team]);

  return (
    <div className="breaker-panel">
      <p className="subtitle">
        Which of your team's Pokemon hits hardest, on average, against the top {POOL_SIZE} most-used Pokemon in the
        current meta (using their real top ability, neutral EVs since we don't have real spread data).
      </p>
      {!pool || !scores ? (
        <p className="subtitle">Calculating against the meta...</p>
      ) : scores.length === 0 ? (
        <p className="subtitle">No team members have moves selected yet.</p>
      ) : (
        <div className="breaker-list">
          {scores.map((s, i) => (
            <div className="breaker-row" key={s.name}>
              <span className="breaker-rank">#{i + 1}</span>
              {s.sprite && <img src={s.sprite} alt="" />}
              <span className="breaker-name">{s.name}</span>
              <span className="breaker-move">best: {s.bestMove}</span>
              <span className="breaker-pct">{s.avgPct.toFixed(1)}% avg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
