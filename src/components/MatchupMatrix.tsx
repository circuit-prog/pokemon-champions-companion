import { useEffect, useState } from "react";
import { calcTeamMatchups } from "../api";
import type { TeamMatchupRow } from "../api";
import type { SavedTeam } from "../teamStorage";
import "./BreakerPanel.css";

// How much of the ranked meta to test against. Bigger is genuinely more
// useful here - a threat sitting at rank 40 still beats you - and the whole
// matrix is computed in one backend request, so the cost is one round trip
// rather than one per Pokemon.
export const POOL_SIZE = 50;

/** Shared engine for the Breaker and Waller panels.
 *
 * Both answer the same underlying question - how does each of your Pokemon do
 * against the current meta - just sorted by opposite ends of it, so they share
 * one request and one row renderer. `mode` decides which direction is ranked
 * and which numbers are emphasised. */
export type MatchupMode = "breaker" | "waller";

function colourFor(pct: number | null, invert: boolean): string {
  // Damage bands, coloured from the perspective of "is this good for me?".
  // For the breaker, high damage dealt is good; for the waller, high damage
  // taken is bad - hence `invert`.
  if (pct === null) return "#eee";
  const good = invert ? pct < 33 : pct >= 100;
  const bad = invert ? pct >= 75 : pct < 33;
  if (good) return "#d7f0dc";
  if (bad) return "#f8d9d9";
  return "#fdf1d4";
}

function CellRow({ cell, mode }: { cell: TeamMatchupRow["cells"][0]; mode: MatchupMode }) {
  const dealt = cell.damage_dealt_pct;
  const taken = cell.damage_taken_pct;
  return (
    <div className="matchup-cell">
      <span className="matchup-cell-rank">#{cell.target_rank}</span>
      {cell.target_sprite && <img src={cell.target_sprite} alt="" />}
      <span className="matchup-cell-name">{cell.target_display_name}</span>

      <span
        className="matchup-cell-num"
        style={{ background: colourFor(dealt, false), opacity: mode === "breaker" ? 1 : 0.55 }}
        title={cell.best_move ? `Your best move: ${cell.best_move}` : "No damaging move hits this Pokemon"}
      >
        {dealt === null ? "—" : `${dealt.toFixed(1)}%`}
        {cell.best_move && <em>{cell.best_move}</em>}
      </span>

      <span
        className="matchup-cell-num"
        style={{ background: colourFor(taken, true), opacity: mode === "waller" ? 1 : 0.55 }}
        title={cell.incoming_move ? `Their most-used move: ${cell.incoming_move}` : "No known damaging move"}
      >
        {taken === null ? "—" : `${taken.toFixed(1)}%`}
        {cell.incoming_move && <em>{cell.incoming_move}</em>}
      </span>
    </div>
  );
}

export default function MatchupMatrix({ team, mode }: { team: SavedTeam; mode: MatchupMode }) {
  const [rows, setRows] = useState<TeamMatchupRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);

    const members = team.slots.map((slot) => ({
      pokemon_name: slot.pokemon.name,
      evs: slot.evs,
      nature: slot.nature,
      ability: slot.ability,
      item: slot.item,
      level: 50,
      moves: slot.moves,
    }));
    if (members.length === 0) {
      setRows([]);
      return;
    }

    calcTeamMatchups(members, POOL_SIZE)
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't reach the calculator. Is the backend running?");
      });
    return () => {
      cancelled = true;
    };
  }, [team]);

  if (error) return <p className="subtitle">{error}</p>;
  if (!rows) return <p className="subtitle">Calculating against the top {POOL_SIZE}...</p>;
  if (rows.length === 0) return <p className="subtitle">Add some Pokemon to your team first.</p>;

  // Breaker ranks by offence (highest average damage dealt first); Waller ranks
  // by defence (lowest average damage taken first). Pokemon with no usable
  // number sort to the bottom either way.
  const sorted = [...rows].sort((a, b) => {
    if (mode === "breaker") return (b.avg_damage_dealt ?? -1) - (a.avg_damage_dealt ?? -1);
    return (a.avg_damage_taken ?? 999) - (b.avg_damage_taken ?? 999);
  });

  return (
    <div className="breaker-list">
      {sorted.map((row, i) => {
        const open = expanded === row.pokemon_name;
        return (
          <div key={row.pokemon_name}>
            <button
              className={`breaker-row breaker-row-button${open ? " open" : ""}`}
              onClick={() => setExpanded(open ? null : row.pokemon_name)}
            >
              <span className="breaker-rank">#{i + 1}</span>
              {row.sprite_url && <img src={row.sprite_url} alt="" />}
              <span className="breaker-name">{row.display_name}</span>
              {mode === "breaker" ? (
                <>
                  <span className="breaker-move">OHKOs {row.ko_count}/{POOL_SIZE}</span>
                  <span className="breaker-pct">
                    {row.avg_damage_dealt === null ? "no damaging moves" : `${row.avg_damage_dealt.toFixed(1)}% avg dealt`}
                  </span>
                </>
              ) : (
                <>
                  <span className="breaker-move">survives {row.survives_count}/{POOL_SIZE}</span>
                  <span className="breaker-pct">
                    {row.avg_damage_taken === null ? "—" : `${row.avg_damage_taken.toFixed(1)}% avg taken`}
                  </span>
                </>
              )}
              <span className="breaker-chevron">{open ? "▾" : "▸"}</span>
            </button>

            {open && (
              <div className="matchup-breakdown">
                <div className="matchup-cell matchup-cell-header">
                  <span className="matchup-cell-rank" />
                  <span />
                  <span className="matchup-cell-name">Meta Pokemon</span>
                  <span className="matchup-cell-num">you deal</span>
                  <span className="matchup-cell-num">you take</span>
                </div>
                {row.cells.map((cell) => (
                  <CellRow key={cell.target_name} cell={cell} mode={mode} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
