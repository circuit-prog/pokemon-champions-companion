import { useEffect, useState } from "react";
import { calcDamage } from "../api";
import type { PokemonDetail } from "../api";
import { loadMetaPool } from "../metaPool";
import AddToTeam from "./AddToTeam";
import "./ChecksAndCounters.css";

const POOL_SIZE = 12;

interface Threat {
  name: string;
  slug: string; // dex slug, so a threat can be added straight to a team
  sprite: string | null;
  moveName: string;
  theirDamagePct: number; // what they do to this Pokemon
  ourDamagePct: number | null; // what this Pokemon does back, best case
}

/**
 * A "check/counter" here means: a top-meta Pokemon whose best move hits this
 * Pokemon hard. We rank by incoming damage and also show what this Pokemon
 * can do back, so you can tell a true counter (hits hard, takes little) from
 * a trade. This is derived purely from our own damage calc against real
 * top-usage Pokemon - no hand-written analysis text involved.
 */
export default function ChecksAndCounters({ pokemon }: { pokemon: PokemonDetail }) {
  const [threats, setThreats] = useState<Threat[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setThreats(null);

    async function run() {
      const pool = await loadMetaPool(POOL_SIZE);
      const defender = { pokemon_name: pokemon.name, evs: {}, nature: "hardy", level: 50 };

      const rows = await Promise.all(
        pool
          .filter((p) => p.pokemon.name !== pokemon.name)
          .map(async (threat): Promise<Threat | null> => {
            if (!threat.topMoveName) return null;
            const attacker = {
              pokemon_name: threat.pokemon.name,
              evs: {},
              nature: "hardy",
              ability: threat.topAbility,
              level: 50,
            };
            try {
              // What they do to us with their most-used move.
              const incoming = await calcDamage(attacker, defender, threat.topMoveName);
              if (incoming.error || incoming.immune) return null;

              // What we do back, taking our single best damaging move.
              const ourMoves = pokemon.moves.filter((m) => m.category !== "status" && m.power).slice(0, 12);
              const outgoing = await Promise.all(
                ourMoves.map((m) =>
                  calcDamage(defender, attacker, m.name).catch(() => null)
                )
              );
              const best = outgoing
                .filter((r): r is NonNullable<typeof r> => !!r && !r.error && !r.immune)
                .reduce<number | null>((max, r) => Math.max(max ?? 0, r.pct_high ?? 0), null);

              return {
                name: threat.pokemon.display_name,
                slug: threat.pokemon.name,
                sprite: threat.pokemon.sprite_url,
                moveName:
                  threat.pokemon.moves.find((m) => m.name === threat.topMoveName)?.display_name ??
                  threat.topMoveName,
                theirDamagePct: incoming.pct_high ?? 0,
                ourDamagePct: best,
              };
            } catch {
              return null;
            }
          })
      );

      const valid = rows.filter((r): r is Threat => r !== null);
      valid.sort((a, b) => b.theirDamagePct - a.theirDamagePct);
      if (!cancelled) setThreats(valid);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [pokemon.name]);

  if (!threats) return <p className="subtitle">Analysing matchups against the top meta...</p>;
  if (threats.length === 0) return <p className="subtitle">No matchup data available.</p>;

  return (
    <div className="checks-counters">
      <p className="subtitle">
        How the top {POOL_SIZE} most-used Pokemon fare against {pokemon.display_name}, using their real most-used
        move and neutral EVs. "Deals" is their damage to {pokemon.display_name}; "takes" is the best {pokemon.display_name}{" "}
        can do back.
      </p>
      <div className="threat-list">
        {threats.map((t) => {
          const wins = t.ourDamagePct != null && t.theirDamagePct > t.ourDamagePct;
          return (
            <div className={wins ? "threat-row danger" : "threat-row"} key={t.name}>
              {t.sprite && <img src={t.sprite} alt="" />}
              <span className="threat-name">{t.name}</span>
              <span className="threat-move">{t.moveName}</span>
              <span className="threat-deals">deals {t.theirDamagePct.toFixed(1)}%</span>
              <span className="threat-takes">
                {t.ourDamagePct != null ? `takes ${t.ourDamagePct.toFixed(1)}%` : "takes —"}
              </span>
              <AddToTeam pokemonName={t.slug} label="+ Add" compact />
            </div>
          );
        })}
      </div>
    </div>
  );
}
