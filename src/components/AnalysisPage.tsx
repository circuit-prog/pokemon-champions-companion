import { useEffect, useMemo, useState } from "react";
import { getMetaAnalysis, getPokemonAnalysis } from "../api";
import type { AnalysisEntry, MetaAnalysis, PokemonAnalysis } from "../api";
import PokemonWriteupSection from "./PokemonWriteupSection";
import TeamAnalysisView from "./TeamAnalysisView";
import "./AnalysisPage.css";

type SortKey =
  | "rank"
  | "name"
  | "offence"
  | "ohko"
  | "defence"
  | "ohko_by"
  | "speed";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "rank", label: "Usage rank" },
  { key: "offence", label: "Hits hardest" },
  { key: "ohko", label: "Most OHKOs" },
  { key: "defence", label: "Takes least damage" },
  { key: "ohko_by", label: "Fewest OHKOs against" },
  { key: "speed", label: "Fastest" },
];

function sortValue(e: AnalysisEntry, key: SortKey): number {
  switch (key) {
    case "offence":
      return -e.offence.avg_best_pct;
    case "ohko":
      return -e.offence.ohko;
    case "defence":
      return e.defence.avg_taken_pct;
    case "ohko_by":
      return e.defence.ohko_by;
    case "speed":
      return e.speed_rank;
    default:
      return e.rank;
  }
}

/** Colour a damage percentage the way a player reads a calc: red = KO range. */
function pctClass(pct: number): string {
  if (pct >= 100) return "analysis-pct ko";
  if (pct >= 50) return "analysis-pct high";
  if (pct >= 25) return "analysis-pct mid";
  return "analysis-pct low";
}

function fmtPct(low: number, high: number): string {
  return low === high ? `${high}%` : `${low}-${high}%`;
}

/** Plain-language readout of what the numbers say, built from the table itself. */
function buildReport(entries: AnalysisEntry[]): string[] {
  const top = (arr: AnalysisEntry[], n: number) => arr.slice(0, n).map((e) => e.display_name).join(", ");
  const byOff = [...entries].sort((a, b) => b.offence.avg_best_pct - a.offence.avg_best_pct);
  const byOhko = [...entries].sort((a, b) => b.offence.ohko - a.offence.ohko);
  const byBulk = [...entries].sort((a, b) => a.defence.avg_taken_pct - b.defence.avg_taken_pct);
  const byFragile = [...entries].sort((a, b) => b.defence.ohko_by - a.defence.ohko_by);
  const bySpeed = [...entries].sort((a, b) => a.speed_rank - b.speed_rank);

  // "Glass cannons": hit harder than the median but are OHKO'd by more than the median.
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const offMed = med(entries.map((e) => e.offence.avg_best_pct));
  const ohkoByMed = med(entries.map((e) => e.defence.ohko_by));
  const glass = entries.filter((e) => e.offence.avg_best_pct > offMed && e.defence.ohko_by > ohkoByMed);
  const sturdy = entries.filter((e) => e.offence.avg_best_pct > offMed && e.defence.ohko_by <= ohkoByMed);

  // Archetype footprint across the pool, weighted by tournament appearances.
  const tagTotals = new Map<string, number>();
  for (const e of entries) {
    for (const a of e.archetypes) {
      tagTotals.set(a.tag, (tagTotals.get(a.tag) ?? 0) + (a.percent / 100) * e.archetype_teams);
    }
  }
  const teamsTotal = entries.reduce((s, e) => s + e.archetype_teams, 0) || 1;
  const tagLine = [...tagTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, v]) => `${t} (${Math.round((100 * v) / teamsTotal)}%)`)
    .join(", ");

  const noSpread = entries.filter((e) => !e.has_spread).length;
  const lines = [
    `Hardest hitters (average damage of each Pokemon's best move against the rest of the top ${entries.length}, each matchup capped at 100%): ${top(byOff, 5)}.`,
    `Most guaranteed OHKOs: ${top(byOhko, 5)} - ${byOhko[0].display_name} guarantees a KO on ${byOhko[0].offence.ohko} of ${byOhko[0].offence.targets} others.`,
    `Hardest to damage: ${top(byBulk, 5)}. Easiest to OHKO: ${top(byFragile, 5)} (${byFragile[0].display_name} is guaranteed-KO'd by ${byFragile[0].defence.ohko_by} others).`,
    `Fastest: ${top(bySpeed, 5)}.`,
    glass.length
      ? `Glass cannons (above-median damage but above-median OHKOs taken): ${glass.slice(0, 8).map((e) => e.display_name).join(", ")}${glass.length > 8 ? ` and ${glass.length - 8} more` : ""}.`
      : "",
    sturdy.length
      ? `Hit hard and stay standing (above-median damage, at-or-below-median OHKOs taken): ${sturdy.slice(0, 8).map((e) => e.display_name).join(", ")}${sturdy.length > 8 ? ` and ${sturdy.length - 8} more` : ""}.`
      : "",
    tagLine ? `Most common archetype tags on tournament teams carrying these Pokemon: ${tagLine}.` : "",
    noSpread
      ? `${noSpread} of ${entries.length} Pokemon have no EV spread data yet and were calculated with a neutral spread, so treat their numbers as rough.`
      : "",
  ];
  return lines.filter(Boolean);
}

function Sprite({ url, name }: { url: string | null; name: string }) {
  return <img className="analysis-sprite" src={url ?? undefined} alt={name} title={name} />;
}

function DetailView({ name, pool, onBack }: { name: string; pool: number; onBack: () => void }) {
  const [data, setData] = useState<PokemonAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moveIdx, setMoveIdx] = useState(0);

  useEffect(() => {
    setData(null);
    setMoveIdx(0);
    getPokemonAnalysis(name, pool)
      .then(setData)
      .catch(() => setError("Couldn't load this Pokemon."));
  }, [name, pool]);

  if (error) return <p className="error-banner">{error}</p>;
  if (!data) return <p className="subtitle">Loading...</p>;

  const s = data.summary;
  const move = data.dealt[moveIdx];

  return (
    <div className="analysis-detail">
      <button className="back-btn" onClick={onBack}>
        ← Analysis
      </button>
      <div className="analysis-detail-head">
        <Sprite url={s.sprite_url} name={s.display_name} />
        <div>
          <h3>
            #{s.rank} {s.display_name} <span className="subtitle">{s.usage_percent}% usage</span>
          </h3>
          <div className="subtitle">
            {s.types.join(" / ")} · {s.ability || "no ability data"} · {s.item || "no item data"} · {s.nature}{" "}
            {s.spread}
            {!s.has_spread && " (no EV data - neutral spread)"}
          </div>
          <div className="subtitle">
            HP {s.stats.hp} · Atk {s.stats.atk} · Def {s.stats.def} · SpA {s.stats.spa} · SpD {s.stats.spd} · Spe{" "}
            {s.stats.spe} (#{s.speed_rank} fastest; outspeeds {s.outspeeds}, outsped by {s.outsped_by})
          </div>
        </div>
      </div>

      <div className="stats-section-title">How to use {s.display_name}</div>
      <PokemonWriteupSection pokemonName={s.pokemon_name} />

      <div className="stats-section-title">Found on</div>
      {s.archetypes.length === 0 ? (
        <p className="subtitle">No tournament teams logged with this Pokemon yet.</p>
      ) : (
        <div className="analysis-arch-list">
          {s.archetypes.map((a) => (
            <div key={a.tag} className="analysis-arch-row">
              <span className="analysis-arch-name">{a.tag}</span>
              <div className="tournament-trend-bar-track">
                <div className="tournament-trend-bar-fill" style={{ width: `${Math.max(a.percent, 1)}%` }} />
              </div>
              <span className="tournament-trend-percent">{a.percent}%</span>
            </div>
          ))}
          <div className="subtitle">of {s.archetype_teams} logged teams with this Pokemon (a team can have several tags).</div>
        </div>
      )}

      <div className="stats-section-title">Its four moves against the rest of the top {pool}</div>
      <div className="analysis-move-tabs">
        {data.dealt.map((m, i) => (
          <button key={m.name} className={i === moveIdx ? "facet-chip active" : "facet-chip"} onClick={() => setMoveIdx(i)}>
            {m.display_name} ({m.usage_percent}%)
          </button>
        ))}
      </div>
      <div className="analysis-move-summary">
        {s.moves[moveIdx] && (
          <span className="subtitle">
            {s.moves[moveIdx].type} · {s.moves[moveIdx].category} · {s.moves[moveIdx].power} BP · average{" "}
            {s.moves[moveIdx].avg_pct}% · guaranteed OHKO on {s.moves[moveIdx].ohko}, possible on{" "}
            {s.moves[moveIdx].possible_ohko}, 2HKO or better on {s.moves[moveIdx].two_hit}, no effect on{" "}
            {s.moves[moveIdx].immune} (of {s.moves[moveIdx].targets})
          </span>
        )}
      </div>
      {move && (
        <div className="analysis-grid">
          {move.targets.map((t) => (
            <div key={t.pokemon_name} className="analysis-cell" title={t.ko_text ?? ""}>
              <Sprite url={t.sprite_url} name={t.display_name} />
              <span className="analysis-cell-name">{t.display_name}</span>
              <span className={pctClass(t.pct_low)}>{t.immune ? "Immune" : fmtPct(t.pct_low, t.pct_high)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="stats-section-title">What each of them does back (their best move into {s.display_name})</div>
      <div className="analysis-grid">
        {data.taken.map((t) => (
          <div key={t.pokemon_name} className="analysis-cell" title={t.ko_text ?? ""}>
            <Sprite url={t.sprite_url} name={t.display_name} />
            <span className="analysis-cell-name">
              {t.display_name}
              {t.faster ? " ⚡" : ""}
            </span>
            <span className="analysis-cell-move">{t.move}</span>
            <span className={pctClass(t.pct_low)}>{fmtPct(t.pct_low, t.pct_high)}</span>
          </div>
        ))}
      </div>
      <p className="subtitle">⚡ = outspeeds {s.display_name}. Percentages are of {s.display_name}'s max HP.</p>
    </div>
  );
}

export default function AnalysisPage({ active }: { active: boolean }) {
  const [data, setData] = useState<MetaAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("rank");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(true);
  const [view, setView] = useState<"meta" | "team">("meta");

  useEffect(() => {
    if (!active || data || view !== "meta") return;
    getMetaAnalysis(100)
      .then(setData)
      .catch(() => setError("Couldn't run the analysis. Is the backend running?"));
  }, [active, data, view]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    return data.entries
      .filter((e) => !q || e.display_name.toLowerCase().includes(q) || e.types.some((t) => t.includes(q)))
      .sort((a, b) => sortValue(a, sort) - sortValue(b, sort) || a.rank - b.rank);
  }, [data, sort, filter]);

  const report = useMemo(() => (data ? buildReport(data.entries) : []), [data]);

  if (selected && data && view === "meta") {
    return (
      <div className="analysis-page">
        <DetailView name={selected} pool={data.pool_size} onBack={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="analysis-page">
      <h2>Deep Analysis</h2>
      <div className="analysis-controls">
        <button className={view === "meta" ? "facet-chip active" : "facet-chip"} onClick={() => setView("meta")}>
          The meta (top 100)
        </button>
        <button className={view === "team" ? "facet-chip active" : "facet-chip"} onClick={() => setView("team")}>
          My team
        </button>
      </div>
      <div className={view === "team" ? "" : "hidden"}>
        <TeamAnalysisView active={active && view === "team"} />
      </div>
      <div className={view === "meta" ? "" : "hidden"}>
      <p className="subtitle">
        Each of the top 100 Pokemon, built with its most-used ability, item and EV spread, using its four most-used
        damaging moves against every other Pokemon in the top 100 (and their best move back). Percentages are of the
        defender's max HP at level 50, singles, no weather unless an ability sets it. Click a Pokemon for the full
        breakdown.
      </p>
      {error && <p className="error-banner">{error}</p>}
      {!data && !error && <p className="subtitle">Running about 40,000 damage calculations...</p>}

      {data && (
        <>
          <div className="analysis-report">
            <button className="facet-chip" onClick={() => setShowReport((s) => !s)}>
              {showReport ? "Hide summary report" : "Show summary report"}
            </button>
            {showReport && (
              <ul>
                {report.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="analysis-controls">
            <input
              className="practice-input"
              placeholder="Filter by name or type..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {SORTS.map((s) => (
              <button key={s.key} className={sort === s.key ? "facet-chip active" : "facet-chip"} onClick={() => setSort(s.key)}>
                {s.label}
              </button>
            ))}
          </div>

          <div className="analysis-table-wrap">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Pokemon</th>
                  <th>Set</th>
                  <th>Its moves (avg damage dealt)</th>
                  <th title="Average damage of its best move into each other top-100 Pokemon, capped at 100% per matchup">
                    Offence
                  </th>
                  <th title="Average damage taken from each other Pokemon's best move">Defence</th>
                  <th>Speed</th>
                  <th>Normally found on</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.pokemon_name} onClick={() => setSelected(e.pokemon_name)} className="analysis-row">
                    <td>{e.rank}</td>
                    <td>
                      <div className="analysis-name-cell">
                        <Sprite url={e.sprite_url} name={e.display_name} />
                        <div>
                          <strong>{e.display_name}</strong>
                          <div className="subtitle">{e.types.join(" / ")}</div>
                        </div>
                      </div>
                    </td>
                    <td className="analysis-set">
                      {e.ability || "?"}
                      <br />
                      {e.item || "?"}
                      <br />
                      <span className="subtitle">
                        {e.nature} {e.has_spread ? e.spread : "no EV data"}
                      </span>
                    </td>
                    <td>
                      {e.moves.map((m) => (
                        <div key={m.name} className="analysis-move-line">
                          <span>{m.display_name}</span>
                          <span className={pctClass(m.avg_pct * 2)}>{m.avg_pct}%</span>
                          <span className="subtitle">{m.ohko} OHKO</span>
                        </div>
                      ))}
                    </td>
                    <td>
                      <div className={pctClass(e.offence.avg_best_pct)}>{e.offence.avg_best_pct}% avg</div>
                      <div className="subtitle">
                        OHKOs {e.offence.ohko} · 2HKO {e.offence.two_hit}
                      </div>
                    </td>
                    <td>
                      <div className={pctClass(e.defence.avg_taken_pct)}>{e.defence.avg_taken_pct}% avg</div>
                      <div className="subtitle">
                        OHKO'd by {e.defence.ohko_by} · 2HKO'd by {e.defence.two_hit_by}
                      </div>
                      <div className="analysis-threats">
                        {e.defence.worst_threats.slice(0, 3).map((t) => (
                          <Sprite key={t.pokemon_name} url={t.sprite_url} name={`${t.display_name} ${t.move} ${fmtPct(t.pct_low, t.pct_high)}`} />
                        ))}
                      </div>
                    </td>
                    <td>
                      {e.stats.spe}
                      <div className="subtitle">#{e.speed_rank}</div>
                    </td>
                    <td>
                      {e.archetypes.length === 0 ? (
                        <span className="subtitle">no data</span>
                      ) : (
                        e.archetypes.slice(0, 3).map((a) => (
                          <div key={a.tag} className="analysis-tag-line">
                            {a.tag} <span className="subtitle">{a.percent}%</span>
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
