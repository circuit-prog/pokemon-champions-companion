import { useEffect, useState } from "react";
import { calcTeamMatchups } from "../api";
import type { TeamMatchupRow } from "../api";
import type { SavedTeam } from "../teamStorage";
import "./BreakerPanel.css"; // reuses .matchup-cell / .breaker-row for the breakdown
import "./TeamThreatReportPanel.css";

// Same pool the Breaker/Waller matrix already tests against - one backend
// request either way, so there's no cost to matching it.
const POOL_SIZE = 50;

/** One meta Pokemon's aggregate pressure on your whole team, read out of the
 *  same matchup matrix Breaker/Waller already compute - this is a different
 *  question asked of the same numbers: not "how does each of MY Pokemon do"
 *  but "which of THEIR Pokemon is the one nobody on my team handles". */
interface ThreatEntry {
  targetName: string;
  displayName: string;
  sprite: string | null;
  rank: number;
  avgDamageIn: number; // average % it deals across your team
  ohkoCount: number; // how many of your 6 it OHKOs
  seriousCount: number; // how many of your 6 it hits for 50%+
  bestAnswer: { myName: string; mySprite: string | null; dealtPct: number; move: string | null } | null;
  perMon: { myName: string; mySprite: string | null; taken: number | null; theirMove: string | null; dealt: number | null; myMove: string | null }[];
}

function buildThreatReport(rows: TeamMatchupRow[]): ThreatEntry[] {
  const byTarget = new Map<string, ThreatEntry>();

  for (const row of rows) {
    for (const cell of row.cells) {
      let entry = byTarget.get(cell.target_name);
      if (!entry) {
        entry = {
          targetName: cell.target_name,
          displayName: cell.target_display_name,
          sprite: cell.target_sprite,
          rank: cell.target_rank,
          avgDamageIn: 0,
          ohkoCount: 0,
          seriousCount: 0,
          bestAnswer: null,
          perMon: [],
        };
        byTarget.set(cell.target_name, entry);
      }
      entry.perMon.push({
        myName: row.display_name,
        mySprite: row.sprite_url,
        taken: cell.damage_taken_pct,
        theirMove: cell.incoming_move,
        dealt: cell.damage_dealt_pct,
        myMove: cell.best_move,
      });
      if (cell.damage_taken_pct != null) {
        if (cell.damage_taken_pct >= 100) entry.ohkoCount++;
        if (cell.damage_taken_pct >= 50) entry.seriousCount++;
      }
      if (
        cell.damage_dealt_pct != null &&
        (entry.bestAnswer === null || cell.damage_dealt_pct > entry.bestAnswer.dealtPct)
      ) {
        entry.bestAnswer = {
          myName: row.display_name,
          mySprite: row.sprite_url,
          dealtPct: cell.damage_dealt_pct,
          move: cell.best_move,
        };
      }
    }
  }

  for (const entry of byTarget.values()) {
    const taken = entry.perMon.map((m) => m.taken).filter((v): v is number => v != null);
    entry.avgDamageIn = taken.length > 0 ? taken.reduce((a, b) => a + b, 0) / taken.length : 0;
  }

  // The Pokemon nobody on your team handles rises to the top: highest
  // average pressure first, ties broken by how many of your 6 it OHKOs.
  return [...byTarget.values()].sort((a, b) => b.avgDamageIn - a.avgDamageIn || b.ohkoCount - a.ohkoCount);
}

export default function TeamThreatReportPanel({ team }: { team: SavedTeam }) {
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
      .then((result) => !cancelled && setRows(result))
      .catch(() => !cancelled && setError("Couldn't reach the calculator. Is the backend running?"));

    return () => {
      cancelled = true;
    };
  }, [team]);

  if (team.slots.length === 0) {
    return <p className="subtitle">Add some Pokemon to your team first.</p>;
  }

  if (error) return <p className="subtitle">{error}</p>;
  if (!rows) return <p className="subtitle">Calculating against the top {POOL_SIZE}...</p>;

  const report = buildThreatReport(rows);
  const worst = report.slice(0, 20);

  return (
    <div className="threat-report-panel">
      <p className="subtitle">
        Every one of the top {POOL_SIZE} ranked Pokemon, scored by how much pressure it puts on your
        <strong> whole</strong> team at once - not just how one of your Pokemon does against it, but the
        Pokemon your team as a whole has no good answer to. Ranked worst first.
      </p>

      <div className="threat-report-list">
        {worst.map((t, i) => {
          const open = expanded === t.targetName;
          return (
            <div key={t.targetName}>
              <button
                className={`breaker-row breaker-row-button${open ? " open" : ""}`}
                onClick={() => setExpanded(open ? null : t.targetName)}
              >
                <span className="breaker-rank">#{i + 1}</span>
                {t.sprite && <img src={t.sprite} alt="" />}
                <span className="breaker-name">
                  {t.displayName}
                  {t.rank > 0 && <span className="threat-meta-rank"> (meta #{t.rank})</span>}
                </span>
                <span className="breaker-move">
                  {t.ohkoCount > 0
                    ? `OHKOs ${t.ohkoCount}/${team.slots.length}`
                    : t.seriousCount > 0
                      ? `hits ${t.seriousCount}/${team.slots.length} for 50%+`
                      : "no major threat"}
                </span>
                <span className="breaker-pct threat-pressure">{t.avgDamageIn.toFixed(1)}% avg pressure</span>
                <span className="breaker-chevron">{open ? "▾" : "▸"}</span>
              </button>

              {!open && t.bestAnswer && (
                <div className="threat-best-answer">
                  Your best answer: {t.bestAnswer.mySprite && <img src={t.bestAnswer.mySprite} alt="" />}
                  <strong>{t.bestAnswer.myName}</strong>
                  {t.bestAnswer.move && ` (${t.bestAnswer.move})`} deals {t.bestAnswer.dealtPct.toFixed(1)}%
                </div>
              )}

              {open && (
                <div className="matchup-breakdown">
                  <div className="matchup-cell matchup-cell-header">
                    <span className="matchup-cell-rank" />
                    <span />
                    <span className="matchup-cell-name">Your Pokemon</span>
                    <span className="matchup-cell-num">it deals</span>
                    <span className="matchup-cell-num">you deal back</span>
                  </div>
                  {t.perMon
                    .slice()
                    .sort((a, b) => (b.taken ?? 0) - (a.taken ?? 0))
                    .map((m) => (
                      <div className="matchup-cell" key={m.myName}>
                        <span className="matchup-cell-rank" />
                        {m.mySprite && <img src={m.mySprite} alt="" />}
                        <span className="matchup-cell-name">{m.myName}</span>
                        <span className="matchup-cell-num">
                          {m.taken != null ? `${m.taken.toFixed(1)}%` : "—"}
                          {m.theirMove && <em>{m.theirMove}</em>}
                        </span>
                        <span className="matchup-cell-num">
                          {m.dealt != null ? `${m.dealt.toFixed(1)}%` : "—"}
                          {m.myMove && <em>{m.myMove}</em>}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
