import { useEffect, useState } from "react";
import { getTopTeams, getTopTeamRoster, calcTeamMatchups } from "../api";
import type { TopTeamOut, TopTeamRoster, MetaPoolEntryOut, TeamMatchupRow, TeamMatchupMember } from "../api";
import type { SavedTeam } from "../teamStorage";
import { statAtLevel } from "../statCalc";
import "./BreakerPanel.css"; // reuses .matchup-cell / .matchup-cell-num for the full grid
import "./MetaCalcsPanel.css"; // reuses .calc-picker / .calc-toolbar-label for the team picker
import "./SpeedIQPanel.css"; // reuses .speed-rung for the speed ladder
import "./TeamVsTeamPanel.css";

/** How many of a real team's six get labelled "Likely to bring" in the
 *  headline section. Champions doubles teams bring 4 of 6 to an actual game -
 *  Pikalytics doesn't publish which four, so this is a stand-in: the four
 *  with the best individual meta rank, on the reasoning that a team's more
 *  broadly-used members are more likely to be core to its plan. Explicitly
 *  labelled as a guess in the UI, not presented as real bring-rate data. */
const LIKELY_BRING_COUNT = 4;

function slotToMember(slot: SavedTeam["slots"][number]): TeamMatchupMember {
  return {
    pokemon_name: slot.pokemon.name,
    evs: slot.evs,
    nature: slot.nature,
    ability: slot.ability,
    item: slot.item,
    level: 50,
    moves: slot.moves,
  };
}

/** A roster member's Speed under whatever nature/EVs it actually runs.
 *  0 for an untracked member with no spread to compute from. */
function rosterSpeed(m: MetaPoolEntryOut): number {
  if (!m.evs || Object.keys(m.evs).length === 0) return statAtLevel(m.base_speed, 0, 50, "spe", "hardy");
  return statAtLevel(m.base_speed, m.evs.spe ?? 0, 50, "spe", m.nature || "hardy");
}

function mySlotSpeed(slot: SavedTeam["slots"][number]): number {
  return statAtLevel(slot.pokemon.speed, slot.evs.spe ?? 0, 50, "spe", slot.nature);
}

export default function TeamVsTeamPanel({ team }: { team: SavedTeam }) {
  const [topTeams, setTopTeams] = useState<TopTeamOut[]>([]);
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [roster, setRoster] = useState<TopTeamRoster | null>(null);
  const [rows, setRows] = useState<TeamMatchupRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getTopTeams()
      .then((teams) => {
        setTopTeams(teams);
        if (teams.length > 0) setSelectedRank(teams[0].rank);
      })
      .catch(() => setError("Couldn't load tournament teams. Is the backend running?"));
  }, []);

  useEffect(() => {
    if (selectedRank == null || team.slots.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRoster(null);
    setRows(null);

    Promise.all([
      getTopTeamRoster(selectedRank),
      calcTeamMatchups(team.slots.map(slotToMember), 6, {}, selectedRank),
    ])
      .then(([rosterResult, matchupRows]) => {
        if (cancelled) return;
        setRoster(rosterResult);
        setRows(matchupRows);
      })
      .catch(() => !cancelled && setError("Couldn't run that matchup."))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [selectedRank, team]);

  if (team.slots.length === 0) {
    return <p className="subtitle">Add some Pokemon to your team first.</p>;
  }

  const opponentLabel = roster
    ? `${roster.author ?? "Unknown"}${roster.record ? ` (${roster.record})` : ""}`
    : "";

  // "Likely to bring": the four roster members with the best individual meta
  // rank (rank 0 = untracked, sorts last). A heuristic, not real data - see
  // the note in the UI.
  const rankedRoster = roster ? [...roster.roster].sort((a, b) => {
    if (a.rank === 0) return 1;
    if (b.rank === 0) return -1;
    return a.rank - b.rank;
  }) : [];
  const likelyBring = rankedRoster.slice(0, LIKELY_BRING_COUNT);
  const possiblePick = rankedRoster.slice(LIKELY_BRING_COUNT);

  // Speed control: interleave your team with their likely four, real spreads
  // both sides.
  const speedLadder = roster
    ? [
        ...team.slots.map((s) => ({
          key: `mine-${s.pokemon.name}`,
          name: s.pokemon.display_name,
          sprite: s.pokemon.sprite_url,
          speed: mySlotSpeed(s),
          mine: true,
        })),
        ...likelyBring.map((m) => ({
          key: `theirs-${m.pokemon_name}`,
          name: m.display_name,
          sprite: m.sprite_url,
          speed: rosterSpeed(m),
          mine: false,
        })),
      ].sort((a, b) => b.speed - a.speed)
    : [];

  // Biggest threat: the opponent Pokemon with the highest average damage
  // dealt to your team across your six, from the matchup rows we already
  // computed - both directions come from the same cells, no extra request.
  let biggestThreat: { name: string; sprite: string | null; avgTaken: number } | null = null;
  const threatBreakdown: { myName: string; mySprite: string | null; theyDeal: number | null; theyMove: string | null; iDeal: number | null; iMove: string | null }[] = [];

  if (rows && rows.length > 0) {
    const byTarget = new Map<string, { name: string; sprite: string | null; taken: number[] }>();
    for (const row of rows) {
      for (const cell of row.cells) {
        const entry = byTarget.get(cell.target_name) ?? { name: cell.target_display_name, sprite: cell.target_sprite, taken: [] };
        if (cell.damage_taken_pct != null) entry.taken.push(cell.damage_taken_pct);
        byTarget.set(cell.target_name, entry);
      }
    }
    let bestName: string | null = null;
    let bestAvg = -1;
    for (const [name, entry] of byTarget) {
      if (entry.taken.length === 0) continue;
      const avg = entry.taken.reduce((a, b) => a + b, 0) / entry.taken.length;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestName = name;
        biggestThreat = { name: entry.name, sprite: entry.sprite, avgTaken: avg };
      }
    }
    if (bestName) {
      for (const row of rows) {
        const cell = row.cells.find((c) => c.target_name === bestName);
        threatBreakdown.push({
          myName: row.display_name,
          mySprite: row.sprite_url,
          theyDeal: cell?.damage_taken_pct ?? null,
          theyMove: cell?.incoming_move ?? null,
          iDeal: cell?.damage_dealt_pct ?? null,
          iMove: cell?.best_move ?? null,
        });
      }
      threatBreakdown.sort((a, b) => (b.theyDeal ?? 0) - (a.theyDeal ?? 0));
    }
  }

  return (
    <div className="team-vs-team-panel">
      <p className="subtitle">
        Your full team against a real tournament team, both directions - what you deal, what they deal
        back, who's faster, and which of their six is the biggest threat to you.
      </p>

      <label className="calc-picker tvt-picker">
        <span className="calc-toolbar-label">Opponent team</span>
        <select
          value={selectedRank ?? ""}
          onChange={(e) => setSelectedRank(Number(e.target.value))}
        >
          {topTeams.map((t) => (
            <option key={t.rank} value={t.rank}>
              #{t.rank} {t.author ?? "Unknown"} ({t.record ?? "?"})
            </option>
          ))}
        </select>
      </label>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="subtitle">Calculating against {opponentLabel || "that team"}...</p>}

      {roster && (
        <>
          <section className="tvt-section">
            <h4>Their likely lineup</h4>
            <p className="tvt-note">
              Pikalytics publishes rosters, not which four of six get brought each game. This shows the
              four with the best individual meta rank as a stand-in for that - a guess, not real
              bring-rate data.
            </p>
            <div className="tvt-lineup">
              {likelyBring.map((m) => (
                <div className="tvt-mon-chip likely" key={m.pokemon_name}>
                  {m.sprite_url && <img src={m.sprite_url} alt="" />}
                  <span>{m.display_name}</span>
                  {m.rank > 0 && <span className="tvt-chip-rank">#{m.rank}</span>}
                </div>
              ))}
            </div>
            {possiblePick.length > 0 && (
              <div className="tvt-lineup possible">
                <span className="tvt-note" style={{ marginBottom: "0.3rem" }}>Possible picks:</span>
                {possiblePick.map((m) => (
                  <div className="tvt-mon-chip" key={m.pokemon_name}>
                    {m.sprite_url && <img src={m.sprite_url} alt="" />}
                    <span>{m.display_name}</span>
                    {m.rank > 0 && <span className="tvt-chip-rank">#{m.rank}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="tvt-section">
            <h4>Speed control</h4>
            <p className="tvt-note">Your team interleaved with their likely four, real spreads both sides.</p>
            <div className="tvt-speed-ladder">
              {speedLadder.map((e) => (
                <div className={e.mine ? "speed-rung mine" : "speed-rung"} key={e.key}>
                  <span className="speed-rung-value">{e.speed}</span>
                  {e.sprite && <img src={e.sprite} alt="" />}
                  <span className="speed-rung-name">{e.name}</span>
                  {e.mine && <span className="speed-rung-tag">Yours</span>}
                </div>
              ))}
            </div>
          </section>

          {biggestThreat && (
            <section className="tvt-section">
              <h4>Their biggest threat to you</h4>
              <p className="tvt-note">
                Ranked by average damage dealt across your whole team using their real most-used move.
              </p>
              <div className="tvt-threat-header">
                {biggestThreat.sprite && <img src={biggestThreat.sprite} alt="" />}
                <strong>{biggestThreat.name}</strong>
                <span className="tvt-threat-avg">{biggestThreat.avgTaken.toFixed(1)}% avg into your team</span>
              </div>
              <div className="tvt-threat-table">
                {threatBreakdown.map((r) => (
                  <div className="tvt-threat-row" key={r.myName}>
                    {r.mySprite && <img src={r.mySprite} alt="" />}
                    <span className="tvt-threat-name">{r.myName}</span>
                    <span className="tvt-threat-num bad">
                      {r.theyDeal != null ? `takes ${r.theyDeal.toFixed(1)}%` : "—"}
                      {r.theyMove && <em> via {r.theyMove}</em>}
                    </span>
                    <span className="tvt-threat-num good">
                      {r.iDeal != null ? `deals ${r.iDeal.toFixed(1)}%` : "—"}
                      {r.iMove && <em> via {r.iMove}</em>}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {rows && (
            <section className="tvt-section">
              <h4>Full matchup grid</h4>
              <p className="tvt-note">Every one of your Pokemon against all six on their roster, both directions.</p>
              <div className="breaker-list">
                {rows.map((row) => {
                  const open = expanded === row.pokemon_name;
                  return (
                    <div key={row.pokemon_name}>
                      <button
                        className={`breaker-row breaker-row-button${open ? " open" : ""}`}
                        onClick={() => setExpanded(open ? null : row.pokemon_name)}
                      >
                        <span className="breaker-rank" />
                        {row.sprite_url && <img src={row.sprite_url} alt="" />}
                        <span className="breaker-name">{row.display_name}</span>
                        <span className="breaker-move">
                          {row.avg_damage_dealt != null ? `${row.avg_damage_dealt.toFixed(1)}% avg dealt` : "—"}
                        </span>
                        <span className="breaker-pct">
                          {row.avg_damage_taken != null ? `${row.avg_damage_taken.toFixed(1)}% avg taken` : "—"}
                        </span>
                        <span className="breaker-chevron">{open ? "▾" : "▸"}</span>
                      </button>
                      {open && (
                        <div className="matchup-breakdown">
                          <div className="matchup-cell matchup-cell-header">
                            <span className="matchup-cell-rank" />
                            <span />
                            <span className="matchup-cell-name">Their Pokemon</span>
                            <span className="matchup-cell-num">you deal</span>
                            <span className="matchup-cell-num">you take</span>
                          </div>
                          {row.cells.map((cell) => (
                            <div className="matchup-cell" key={cell.target_name}>
                              <span className="matchup-cell-rank">
                                {cell.target_rank > 0 ? `#${cell.target_rank}` : ""}
                              </span>
                              {cell.target_sprite && <img src={cell.target_sprite} alt="" />}
                              <span className="matchup-cell-name">{cell.target_display_name}</span>
                              <span className="matchup-cell-num">
                                {cell.damage_dealt_pct != null ? `${cell.damage_dealt_pct.toFixed(1)}%` : "—"}
                                {cell.best_move && <em>{cell.best_move}</em>}
                              </span>
                              <span className="matchup-cell-num">
                                {cell.damage_taken_pct != null ? `${cell.damage_taken_pct.toFixed(1)}%` : "—"}
                                {cell.incoming_move && <em>{cell.incoming_move}</em>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
