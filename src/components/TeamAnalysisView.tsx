import { useEffect, useState } from "react";
import { analyseTeam, getPracticeStats } from "../api";
import type { PracticeTeamStat, TeamAnalysis, TeamMatchupMember } from "../api";
import { loadTeams } from "../teamStorage";
import type { SavedTeam } from "../teamStorage";
import PokemonWriteupSection from "./PokemonWriteupSection";

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

function pctClass(pct: number): string {
  if (pct >= 100) return "analysis-pct ko";
  if (pct >= 50) return "analysis-pct high";
  if (pct >= 25) return "analysis-pct mid";
  return "analysis-pct low";
}

function fmtPct(low: number, high: number): string {
  return low === high ? `${high}%` : `${low}-${high}%`;
}

/** Plain-English verdict lines built from the report itself. */
function buildVerdict(a: TeamAnalysis, teamSize: number): string[] {
  const lines: string[] = [];
  const cov = a.coverage;
  lines.push(
    `Your team has a guaranteed one-hit KO on ${cov.guaranteed_ohko} of the top ${cov.targets} Pokemon and a two-hit KO or better on ${cov.two_hit_or_better}.`,
  );
  if (cov.gaps.length) {
    lines.push(
      `Nothing on your team does even half damage to: ${cov.gaps
        .slice(0, 6)
        .map((g) => g.display_name)
        .join(", ")}${cov.gaps.length > 6 ? " and more" : ""}.`,
    );
  }
  const bad = a.type_chart.filter((t) => t.net >= 2);
  if (bad.length) {
    lines.push(
      `Stacked weaknesses: ${bad
        .map((t) => `${t.type} (${t.weak} weak${t.resist + t.immune ? `, ${t.resist + t.immune} cover it` : ", none resist"})`)
        .join("; ")}.`,
    );
  } else {
    lines.push("No attacking type is a net weakness of 2 or more, so the typing is reasonably balanced.");
  }
  const missing = a.roles.filter((r) => ["Speed control", "Fake Out", "Protect"].includes(r.role) && r.have.length === 0);
  if (missing.length) lines.push(`Missing: ${missing.map((m) => m.role.toLowerCase()).join(", ")}.`);
  if (a.threats.length) {
    lines.push(
      `Biggest threats to the team as a whole: ${a.threats
        .slice(0, 4)
        .map((t) => `${t.display_name} (hurts ${t.hits}/${teamSize})`)
        .join(", ")}.`,
    );
  }
  if (a.archetypes.length) lines.push(`Reads as: ${a.archetypes.join(", ")}.`);
  if (a.members_without_moves.length) {
    lines.push(
      `${a.members_without_moves.join(", ")} ${a.members_without_moves.length > 1 ? "have" : "has"} no moves chosen yet, so ${a.members_without_moves.length > 1 ? "they were" : "it was"} left out of the damage numbers.`,
    );
  }
  return lines;
}

export default function TeamAnalysisView({ active }: { active: boolean }) {
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [teamId, setTeamId] = useState("");
  const [report, setReport] = useState<TeamAnalysis | null>(null);
  const [record, setRecord] = useState<PracticeTeamStat | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-read saved teams whenever the tab is shown (same stale-data issue the
  // Team Tools tab had): edits made on the Teams tab show up here.
  useEffect(() => {
    if (!active) return;
    const loaded = loadTeams();
    setTeams(loaded);
    setTeamId((prev) => (loaded.some((t) => t.id === prev) ? prev : loaded[0]?.id ?? ""));
  }, [active]);

  const team = teams.find((t) => t.id === teamId) ?? null;

  useEffect(() => {
    if (!team || team.slots.length === 0) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    analyseTeam(team.slots.map(slotToMember))
      .then((r) => !cancelled && setReport(r))
      .catch(() => !cancelled && setError("Couldn't analyse that team. Is the backend running?"))
      .finally(() => !cancelled && setLoading(false));
    getPracticeStats()
      .then((s) => !cancelled && setRecord(s.by_team.find((t) => t.team_name === team.name) ?? null))
      .catch(() => !cancelled && setRecord(null));
    return () => {
      cancelled = true;
    };
    // Re-run if the team's contents change, not just which team is picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, team?.updatedAt, active]);

  if (teams.length === 0) {
    return <p className="subtitle">Build a team first (in the Teams tab), then come back here to analyse it.</p>;
  }

  return (
    <div className="analysis-team">
      <label className="field team-tools-select">
        Team
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.slots.length}/6)
            </option>
          ))}
        </select>
      </label>

      {team && team.slots.length === 0 && <p className="subtitle">This team has no Pokemon yet.</p>}
      {error && <p className="error-banner">{error}</p>}
      {loading && !report && <p className="subtitle">Analysing...</p>}

      {report && team && team.slots.length > 0 && (
        <>
          <div className="analysis-report">
            <strong>Verdict (against the top {report.pool_size})</strong>
            <ul>
              {buildVerdict(report, report.members.length).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
              {record && (
                <li>
                  Your practice record with this team: {record.wins}/{record.games} ({record.win_rate}%).
                </li>
              )}
            </ul>
          </div>

          <div className="stats-section-title">Pokemon on the team</div>
          <div className="analysis-team-members">
            {report.members.map((m) => (
              <div key={m.pokemon_name} className="analysis-team-member">
                <div className="analysis-detail-head">
                  <img className="analysis-sprite" src={m.sprite_url ?? undefined} alt={m.display_name} />
                  <div>
                    <strong>{m.display_name}</strong>
                    <div className="subtitle">
                      {m.types.join(" / ")} · {m.ability || "no ability"} · {m.item || "no item"}
                    </div>
                    <div className="subtitle">
                      {m.nature} {m.spread} · Spe {m.stats.spe} (outspeeds {m.speed_outspeeds}, outsped by{" "}
                      {m.speed_outsped_by})
                    </div>
                  </div>
                </div>
                {m.moves.length === 0 ? (
                  <p className="subtitle">No damaging moves chosen.</p>
                ) : (
                  m.moves.map((mv) => (
                    <div key={mv.name} className="analysis-move-line">
                      <span>{mv.display_name}</span>
                      <span className={pctClass(mv.avg_pct * 2)}>{mv.avg_pct}% avg</span>
                      <span className="subtitle">
                        {mv.ohko} OHKO · {mv.two_hit} 2HKO · {mv.immune} no effect
                      </span>
                    </div>
                  ))
                )}
                <div className="subtitle">
                  Takes {m.defence.avg_taken_pct}% avg · OHKO'd by {m.defence.ohko_by} · 2HKO'd by {m.defence.two_hit_by}
                </div>
                <div className="analysis-threats">
                  {m.defence.worst_threats.map((t) => (
                    <img
                      key={t.pokemon_name}
                      className="analysis-sprite"
                      src={t.sprite_url ?? undefined}
                      alt={t.display_name}
                      title={`${t.display_name} ${t.move} ${fmtPct(t.pct_low, t.pct_high)}`}
                    />
                  ))}
                </div>
                <details>
                  <summary>How to use {m.display_name} (strategy notes)</summary>
                  <PokemonWriteupSection pokemonName={m.pokemon_name} />
                </details>
              </div>
            ))}
          </div>

          <div className="stats-section-title">Weaknesses (how many of your Pokemon are weak / resist / immune)</div>
          <div className="analysis-type-grid">
            {[...report.type_chart]
              .sort((a, b) => a.type.localeCompare(b.type))
              .map((t) => (
                <div
                  key={t.type}
                  className={`analysis-type-cell ${t.net >= 2 ? "bad" : t.net <= -2 ? "good" : ""}`}
                  title={`${t.weak} weak (${t.quad} double-weak), ${t.resist} resist, ${t.immune} immune`}
                >
                  <strong>{t.type}</strong>
                  <span>
                    {t.weak}W · {t.resist}R{t.immune ? ` · ${t.immune}I` : ""}
                  </span>
                </div>
              ))}
          </div>

          <div className="stats-section-title">Team roles</div>
          <div className="analysis-roles">
            {report.roles.map((r) => (
              <div key={r.role} className={`analysis-role ${r.have.length ? "have" : "missing"}`}>
                <strong>{r.role}</strong>
                <span>{r.have.length ? r.have.join(", ") : "none"}</span>
              </div>
            ))}
          </div>

          <div className="stats-section-title">Pokemon your team struggles to damage (best hit under 50%)</div>
          {report.coverage.gaps.length === 0 ? (
            <p className="subtitle">Every top-{report.pool_size} Pokemon takes at least half from something on your team.</p>
          ) : (
            <div className="analysis-grid">
              {report.coverage.gaps.map((g) => (
                <div key={g.pokemon_name} className="analysis-cell">
                  <img className="analysis-sprite" src={g.sprite_url ?? undefined} alt={g.display_name} />
                  <span className="analysis-cell-name">{g.display_name}</span>
                  <span className="analysis-cell-move">
                    #{g.rank} usage
                  </span>
                  <span className={pctClass(g.best_pct)}>
                    {g.best_by ? `${g.best_pct}% (${g.best_by})` : "no damaging move"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="stats-section-title">Biggest threats to the team (a 2HKO or better on two or more of yours)</div>
          {report.threats.length === 0 ? (
            <p className="subtitle">Nothing in the top {report.pool_size} threatens two or more of your Pokemon.</p>
          ) : (
            <div className="analysis-grid">
              {report.threats.map((t) => (
                <div key={t.pokemon_name} className="analysis-cell" title={t.targets.join(", ")}>
                  <img className="analysis-sprite" src={t.sprite_url ?? undefined} alt={t.display_name} />
                  <span className="analysis-cell-name">{t.display_name}</span>
                  <span className="analysis-cell-move">
                    hurts {t.hits}, OHKOs {t.ohkos}
                  </span>
                  <span className="analysis-cell-move">faster than {t.faster_than}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
