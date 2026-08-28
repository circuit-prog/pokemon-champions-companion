import { useEffect, useState } from "react";
import { calcDamage } from "../api";
import type { SavedTeam } from "../teamStorage";
import { loadMetaPool } from "../metaPool";
import type { MetaPoolEntry } from "../metaPool";
import "./BreakerPanel.css";

const POOL_SIZE = 10;

interface WallerScore {
  name: string;
  sprite: string | null;
  worstAttacker: string;
  avgPctTaken: number;
}

export default function WallerPanel({ team }: { team: SavedTeam }) {
  const [scores, setScores] = useState<WallerScore[] | null>(null);
  const [pool, setPool] = useState<MetaPoolEntry[] | null>(null);

  useEffect(() => {
    loadMetaPool(POOL_SIZE).then(setPool);
  }, []);

  useEffect(() => {
    if (!pool) return;
    let cancelled = false;

    async function run() {
      const results: WallerScore[] = [];
      for (const slot of team.slots) {
        const perAttacker = await Promise.all(
          pool!.map(async (attacker) => {
            if (!attacker.topMoveName) return null;
            try {
              const r = await calcDamage(
                { pokemon_name: attacker.pokemon.name, evs: {}, nature: "hardy", ability: attacker.topAbility, level: 50 },
                { pokemon_name: slot.pokemon.name, evs: slot.evs, nature: slot.nature, ability: slot.ability, item: slot.item, level: 50 },
                attacker.topMoveName
              );
              if (r.error || r.immune) return null;
              return { attackerName: attacker.pokemon.display_name, pct: r.pct_high ?? 0 };
            } catch {
              return null;
            }
          })
        );
        const valid = perAttacker.filter((x): x is NonNullable<typeof x> => x !== null);
        if (valid.length === 0) continue;
        const avgPctTaken = valid.reduce((sum, x) => sum + x.pct, 0) / valid.length;
        const worst = [...valid].sort((a, b) => b.pct - a.pct)[0];

        results.push({ name: slot.pokemon.display_name, sprite: slot.pokemon.sprite_url, worstAttacker: worst.attackerName, avgPctTaken });
      }
      results.sort((a, b) => a.avgPctTaken - b.avgPctTaken);
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
        Which of your team's Pokemon takes the least damage, on average, from the top {POOL_SIZE} most-used
        Pokemon's real top move in the current meta. Lower is better (more likely to survive and switch in safely).
      </p>
      {!pool || !scores ? (
        <p className="subtitle">Calculating against the meta...</p>
      ) : (
        <div className="breaker-list">
          {scores.map((s, i) => (
            <div className="breaker-row" key={s.name}>
              <span className="breaker-rank">#{i + 1}</span>
              {s.sprite && <img src={s.sprite} alt="" />}
              <span className="breaker-name">{s.name}</span>
              <span className="breaker-move">worst matchup: {s.worstAttacker}</span>
              <span className="breaker-pct">{s.avgPctTaken.toFixed(1)}% avg taken</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
