import { useEffect, useState } from "react";
import {
  getTournaments,
  getTournament,
  createTournament,
  updateTournament,
  deleteTournament,
  addTournamentResult,
  updateTournamentResult,
  deleteTournamentResult,
  searchTournamentsByPokemon,
  calcVersus,
  getPlayer,
} from "../api";
import type {
  TournamentSummary,
  TournamentDetail,
  TournamentResultOut,
  TournamentResultIn,
  TournamentIn,
  TournamentSearchHit,
  VersusPair,
  PlayerDetail,
} from "../api";
import { loadTeams } from "../teamStorage";
import type { SavedTeam } from "../teamStorage";
import TournamentResultEditor from "./TournamentResultEditor";
import "./MetaCalcsPanel.css"; // reuses .calc-pair / .calc-side / .calc-line for the comparison view
import "./TournamentsPage.css";

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

type View =
  | { kind: "list" }
  | { kind: "detail"; id: number }
  | { kind: "edit-tournament"; id: number | null }
  | { kind: "edit-result"; tournamentId: number; result: TournamentResultOut | null }
  | { kind: "player"; externalId: string; back: View }
  | { kind: "compare"; ids: [number, number] };

function TournamentCompareView({ ids, onBack }: { ids: [number, number]; onBack: () => void }) {
  const [details, setDetails] = useState<[TournamentDetail, TournamentDetail] | null>(null);

  useEffect(() => {
    Promise.all([getTournament(ids[0]), getTournament(ids[1])]).then(setDetails);
  }, [ids]);

  if (!details) return <p className="subtitle">Loading...</p>;
  const [a, b] = details;

  const aCounts = new Map(a.most_brought.map((e) => [e.pokemon_name, e]));
  const bCounts = new Map(b.most_brought.map((e) => [e.pokemon_name, e]));
  const allNames = Array.from(new Set([...aCounts.keys(), ...bCounts.keys()]));

  return (
    <div className="tournament-compare-view">
      <button className="back-btn" onClick={onBack}>
        ← Tournaments
      </button>
      <h3>Comparing tournaments</h3>
      <div className="tournament-compare-columns">
        <div>
          <strong>{a.name}</strong>
          <div className="subtitle">{a.date}</div>
        </div>
        <div>
          <strong>{b.name}</strong>
          <div className="subtitle">{b.date}</div>
        </div>
      </div>
      <div className="tournament-compare-diff-list">
        {allNames.map((name) => {
          const aEntry = aCounts.get(name);
          const bEntry = bCounts.get(name);
          const aPct = a.results.length ? Math.round((100 * (aEntry?.count ?? 0)) / a.results.length) : 0;
          const bPct = b.results.length ? Math.round((100 * (bEntry?.count ?? 0)) / b.results.length) : 0;
          const display = aEntry?.display_name ?? bEntry?.display_name ?? name;
          const sprite = aEntry?.sprite_url ?? bEntry?.sprite_url;
          return (
            <div key={name} className="tournament-compare-diff-row">
              <img src={sprite ?? undefined} alt={display} />
              <span className="tournament-compare-diff-name">{display}</span>
              <span className="tournament-compare-diff-value">{aEntry ? `${aEntry.count} (${aPct}%)` : "-"}</span>
              <span className={`tournament-compare-diff-delta ${aPct === bPct ? "" : aPct > bPct ? "down" : "up"}`}>
                {aPct === bPct ? "=" : aPct > bPct ? "▼" : "▲"}
              </span>
              <span className="tournament-compare-diff-value">{bEntry ? `${bEntry.count} (${bPct}%)` : "-"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VerdictIcon({ verdict }: { verdict: "good" | "warning" | "bad" }) {
  const glyph = verdict === "good" ? "✓" : verdict === "warning" ? "⚠" : "✗";
  return (
    <span className={`calc-verdict ${verdict}`} aria-hidden="true">
      {glyph}
    </span>
  );
}

function CompareCard({ pair }: { pair: VersusPair }) {
  return (
    <div className="calc-pair">
      <div className="calc-pair-header">
        <div className={pair.attacker.moves_first ? "calc-side first" : "calc-side"}>
          {pair.attacker.sprite_url && <img src={pair.attacker.sprite_url} alt="" />}
          <div className="calc-side-text">
            <strong>{pair.attacker.display_name}</strong>
            <span className="calc-side-speed">{pair.attacker.speed} Speed</span>
          </div>
        </div>
        <span className="calc-vs">vs</span>
        <div className={pair.defender.moves_first ? "calc-side first" : "calc-side"}>
          {pair.defender.sprite_url && <img src={pair.defender.sprite_url} alt="" />}
          <div className="calc-side-text">
            <strong>{pair.defender.display_name}</strong>
            <span className="calc-side-speed">{pair.defender.speed} Speed</span>
          </div>
        </div>
      </div>
      {pair.results.length === 0 ? (
        <p className="calc-empty">No damaging moves selected on {pair.attacker.display_name}.</p>
      ) : (
        <div className="calc-lines">
          {pair.results.map((r) => (
            <div className="calc-line" key={r.move_name}>
              <VerdictIcon verdict={r.verdict} />
              <span className="calc-desc">
                {r.description}
                {r.ko_text ? ` -- ${r.ko_text.toLowerCase()}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Compare to my team": pick a saved team, run it both directions against
 *  this result's roster via the same /api/calc/versus endpoint Meta Calcs'
 *  Team -> Team mode already uses - no new backend work needed. */
function CompareToMyTeam({ result }: { result: TournamentResultOut }) {
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [teamId, setTeamId] = useState("");
  const [pairs, setPairs] = useState<VersusPair[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) setTeams(loadTeams());
  }, [open]);

  function run(id: string) {
    setTeamId(id);
    setPairs(null);
    setError(null);
    const team = teams.find((t) => t.id === id);
    if (!team) return;
    const mine = team.slots.map((s) => ({
      pokemon_name: s.pokemon.name,
      evs: s.evs,
      nature: s.nature,
      ability: s.ability,
      item: s.item,
      moves: s.moves,
    }));
    const theirs = result.roster.map((r) => ({
      pokemon_name: r.pokemon_name,
      evs: r.evs,
      nature: r.nature,
      ability: r.ability ?? undefined,
      item: r.item ?? undefined,
      moves: r.moves,
    }));
    calcVersus(mine, theirs, {})
      .then(setPairs)
      .catch(() => setError("Couldn't reach the calculator. Is the backend running?"));
  }

  return (
    <div className="tournament-compare">
      <button className="tournament-compare-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide comparison" : "Compare to my team"}
      </button>
      {open && (
        <div className="tournament-compare-body">
          <select value={teamId} onChange={(e) => run(e.target.value)}>
            <option value="" disabled>
              Choose a team...
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {error && <p className="subtitle">{error}</p>}
          {pairs && pairs.map((p, i) => <CompareCard pair={p} key={i} />)}
        </div>
      )}
    </div>
  );
}

export default function TournamentsPage() {
  const [view, setView] = useState<View>({ kind: "list" });
  const [tournaments, setTournaments] = useState<TournamentSummary[] | null>(null);
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [filter, setFilter] = useState("");
  const [minPlayers, setMinPlayers] = useState("");
  const [filterHits, setFilterHits] = useState<TournamentSearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<"date" | "players" | "results">("date");
  const [formatFilter, setFormatFilter] = useState<"all" | "m-a" | "m-b" | "m-c">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "online" | "in-person">("all");
  const [myTeams, setMyTeams] = useState<SavedTeam[]>([]);
  const [myTeamId, setMyTeamId] = useState("");
  const [myTeamTournamentIds, setMyTeamTournamentIds] = useState<Set<number> | null>(null);
  const [myTeamLoading, setMyTeamLoading] = useState(false);
  const [playstyleFilter, setPlaystyleFilter] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [visibleCount, setVisibleCount] = useState(24);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);

  function refreshList() {
    getTournaments()
      .then(setTournaments)
      .catch(() => setError("Couldn't reach the backend."));
  }

  function refreshDetail(id: number) {
    getTournament(id)
      .then(setDetail)
      .catch(() => setError("Couldn't load this tournament."));
  }

  useEffect(() => {
    if (view.kind === "list") {
      refreshList();
      setDetail(null);
      setMyTeams(loadTeams());
    } else if (view.kind === "detail") {
      refreshDetail(view.id);
      setPlaystyleFilter("");
    }
  }, [view]);

  useEffect(() => {
    setVisibleCount(24);
  }, [minPlayers, formatFilter, sourceFilter, sortKey, myTeamId, viewMode]);

  // "Only my team's Pokemon" - reuses the existing per-Pokemon search
  // endpoint (one call per unique species on the team) rather than fetching
  // full details for every tournament just to check its roster.
  useEffect(() => {
    if (!myTeamId) {
      setMyTeamTournamentIds(null);
      return;
    }
    const team = myTeams.find((t) => t.id === myTeamId);
    if (!team) return;
    const species = Array.from(new Set(team.slots.map((s) => s.pokemon.name)));
    setMyTeamLoading(true);
    Promise.all(species.map((name) => searchTournamentsByPokemon(name).catch(() => [])))
      .then((results) => {
        const ids = new Set<number>();
        results.flat().forEach((hit) => ids.add(hit.tournament_id));
        setMyTeamTournamentIds(ids);
      })
      .finally(() => setMyTeamLoading(false));
  }, [myTeamId, myTeams]);

  useEffect(() => {
    if (!filter.trim()) {
      setFilterHits(null);
      return;
    }
    const handle = setTimeout(() => {
      const slug = filter.trim().toLowerCase().replace(/\s+/g, "-");
      searchTournamentsByPokemon(slug)
        .then(setFilterHits)
        .catch(() => setFilterHits([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [filter]);

  async function saveTournament(body: TournamentIn) {
    setError(null);
    try {
      const id = view.kind === "edit-tournament" ? view.id : null;
      const saved = id ? await updateTournament(id, body) : await createTournament(body);
      setView({ kind: "detail", id: saved.id });
    } catch {
      setError("Couldn't save this tournament. Is the backend running?");
    }
  }

  async function removeTournament(id: number) {
    if (!confirm("Delete this tournament and all its results? This can't be undone.")) return;
    try {
      await deleteTournament(id);
      setView({ kind: "list" });
    } catch {
      setError("Couldn't delete this tournament.");
    }
  }

  async function saveResult(tournamentId: number, resultId: number | null, body: TournamentResultIn) {
    setError(null);
    try {
      if (resultId) await updateTournamentResult(tournamentId, resultId, body);
      else await addTournamentResult(tournamentId, body);
      setView({ kind: "detail", id: tournamentId });
    } catch {
      setError("Couldn't save this result. Is the backend running?");
    }
  }

  async function removeResult(tournamentId: number, resultId: number) {
    if (!confirm("Delete this result?")) return;
    try {
      await deleteTournamentResult(tournamentId, resultId);
      refreshDetail(tournamentId);
    } catch {
      setError("Couldn't delete this result.");
    }
  }

  if (view.kind === "edit-tournament") {
    const existing = tournaments?.find((t) => t.id === view.id);
    return (
      <TournamentForm
        initial={existing ? { name: existing.name, date: existing.date, format: existing.format, player_count: existing.player_count, source_url: detail?.source_url ?? null, notes: detail?.notes ?? null } : null}
        onSave={saveTournament}
        onCancel={() => setView(view.id ? { kind: "detail", id: view.id } : { kind: "list" })}
      />
    );
  }

  if (view.kind === "edit-result") {
    return (
      <div className="tournaments-page">
        <button className="back-btn" onClick={() => setView({ kind: "detail", id: view.tournamentId })}>
          ← Back
        </button>
        <h3>{view.result ? "Edit Result" : "Add Result"}</h3>
        <TournamentResultEditor
          initial={view.result}
          onSave={(body) => saveResult(view.tournamentId, view.result?.id ?? null, body)}
          onCancel={() => setView({ kind: "detail", id: view.tournamentId })}
        />
      </div>
    );
  }

  if (view.kind === "compare") {
    return (
      <div className="tournaments-page">
        <TournamentCompareView ids={view.ids} onBack={() => setView({ kind: "list" })} />
      </div>
    );
  }

  if (view.kind === "player") {
    return (
      <PlayerView
        externalId={view.externalId}
        onBack={() => setView(view.back)}
        onOpenTournament={(id) => setView({ kind: "detail", id })}
      />
    );
  }

  if (view.kind === "detail") {
    if (!detail) return <p className="subtitle">Loading...</p>;
    return (
      <div className="tournaments-page">
        <button className="back-btn" onClick={() => setView({ kind: "list" })}>
          ← Tournaments
        </button>
        {error && <p className="error-banner">{error}</p>}

        <div className="tournament-detail-header">
          <div>
            <h2>
              {detail.name} {detail.is_online && <span className="online-badge">Online</span>}
            </h2>
            <p className="subtitle">
              {detail.date}
              {detail.player_count != null && ` · ${detail.player_count} players`}
              {detail.source_url && (
                <>
                  {" · "}
                  <a href={detail.source_url} target="_blank" rel="noreferrer">
                    Source
                  </a>
                </>
              )}
            </p>
            {detail.notes && <p className="tournament-notes">{detail.notes}</p>}
          </div>
          <div className="tournament-detail-actions">
            <button onClick={() => setView({ kind: "edit-tournament", id: detail.id })}>Edit</button>
            <button className="danger" onClick={() => removeTournament(detail.id)}>
              Delete
            </button>
          </div>
        </div>

        {detail.most_brought.length > 0 && (
          <div className="tournament-most-brought">
            <h3>Most brought (top {detail.results.length})</h3>
            <div className="tournament-most-brought-list">
              {detail.most_brought.map((m) => (
                <div className="tournament-most-brought-entry" key={m.pokemon_name}>
                  {m.sprite_url && <img src={m.sprite_url} alt="" />}
                  <span>{m.display_name}</span>
                  <span className="tournament-most-brought-count">{m.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {detail.tournament_stats.length > 0 && (
          <div className="tournament-most-brought">
            <h3>Tournament-wide stats</h3>
            <p className="subtitle">
              Every tracked player at this event, not just the top {detail.results.length} above - from
              limitlessvgc.com's own statistics page.
            </p>
            <div className="tournament-most-brought-list">
              {detail.tournament_stats.map((s) => (
                <div className="tournament-most-brought-entry" key={s.pokemon_name}>
                  {s.sprite_url && <img src={s.sprite_url} alt="" />}
                  <span>{s.display_name}</span>
                  <span className="tournament-most-brought-count">
                    {s.count}
                    {s.share_percent != null && ` (${s.share_percent}%)`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="tournament-results-header">
          <h3>Results ({detail.results.length})</h3>
          <button onClick={() => setView({ kind: "edit-result", tournamentId: detail.id, result: null })}>
            + Add Result
          </button>
        </div>

        {(() => {
          const playstyles = Array.from(new Set(detail.results.flatMap((r) => r.archetypes))).sort();
          return (
            playstyles.length > 0 && (
              <div className="tournaments-facet-group tournament-playstyle-filter">
                <span className="tournaments-facet-label">Playstyle</span>
                <select value={playstyleFilter} onChange={(e) => setPlaystyleFilter(e.target.value)}>
                  <option value="">All</option>
                  {playstyles.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            )
          );
        })()}

        <div className="tournament-results-list">
          {detail.results
            .filter((r) => !playstyleFilter || r.archetypes.includes(playstyleFilter))
            .map((r) => {
            const hasSets = r.roster.some((s) => s.item || s.ability || s.moves.length > 0);
            const open = expandedResult === r.id;
            return (
              <div className="tournament-result-card" key={r.id}>
                <div className="tournament-result-row">
                  <span className="tournament-result-placement">#{r.placement}</span>
                  {r.player &&
                    (r.player_external_id ? (
                      <button
                        className="tournament-player-link"
                        onClick={() =>
                          setView({ kind: "player", externalId: r.player_external_id as string, back: view })
                        }
                      >
                        {r.player}
                      </button>
                    ) : (
                      <strong>{r.player}</strong>
                    ))}
                  {(r.prize_money || r.points != null || r.record) && (
                    <span className="tournament-result-payout">
                      {[r.prize_money, r.points != null ? `${r.points} pts` : null, r.record]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                  {r.is_dark_horse && <span className="dark-horse-badge">Dark horse</span>}
                  {r.archetypes.map((tag) => (
                    <span key={tag} className="archetype-badge">
                      {tag}
                    </span>
                  ))}
                  <button
                    className="tournament-result-roster tournament-result-roster-btn"
                    onClick={() => setExpandedResult(open ? null : r.id)}
                    title={hasSets ? "Show sets" : "No set data on this result yet"}
                  >
                    {r.roster.map((slot) => (
                      <img key={slot.pokemon_name} src={slot.sprite_url ?? undefined} alt={slot.display_name} title={slot.display_name} />
                    ))}
                  </button>
                  <div className="tournament-result-actions-inline">
                    <button onClick={() => setView({ kind: "edit-result", tournamentId: detail.id, result: r })}>Edit</button>
                    <button className="danger" onClick={() => removeResult(detail.id, r.id)}>
                      Delete
                    </button>
                  </div>
                </div>
                {r.notes && <p className="tournament-result-notes">{r.notes}</p>}
                {open && (
                  <div className="tournament-result-sets">
                    {r.roster.map((slot) => (
                      <div className="tournament-result-set" key={slot.pokemon_name}>
                        {slot.sprite_url && <img src={slot.sprite_url} alt="" />}
                        <div>
                          <strong>{slot.display_name}</strong>
                          <span className="subtitle">
                            {[slot.ability, slot.item].filter(Boolean).map(titleCase).join(" · ") || "No set data"}
                            {slot.nature && slot.nature !== "hardy" && ` · ${titleCase(slot.nature)}`}
                          </span>
                          {slot.moves.length > 0 && (
                            <span className="subtitle">{slot.moves.map(titleCase).join(", ")}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <CompareToMyTeam result={r} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // list view
  return (
    <div className="tournaments-page">
      <h2>Tournaments</h2>
      <p className="subtitle">Real official Champions events, with full team sets - browse by date, or find who ran a Pokemon.</p>
      {error && <p className="error-banner">{error}</p>}

      <div className="tournaments-list-header">
        <input
          className="tournament-filter-input"
          type="text"
          placeholder="Filter by a Pokemon on the team..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <input
          className="tournament-min-players-input"
          type="number"
          min={0}
          placeholder="Min players"
          value={minPlayers}
          onChange={(e) => setMinPlayers(e.target.value)}
        />
        <button className="new-team-btn" onClick={() => setView({ kind: "edit-tournament", id: null })}>
          + New Tournament
        </button>
      </div>

      <div className="tournaments-list-header">
        <div className="tournaments-facet-group">
          <span className="tournaments-facet-label">View</span>
          {(["list", "timeline"] as const).map((m) => (
            <button
              key={m}
              className={viewMode === m ? "facet-chip active" : "facet-chip"}
              onClick={() => setViewMode(m)}
            >
              {m === "list" ? "List" : "Timeline"}
            </button>
          ))}
        </div>
        <button
          className={compareMode ? "facet-chip active" : "facet-chip"}
          onClick={() => {
            setCompareMode(!compareMode);
            setCompareIds([]);
          }}
        >
          {compareMode ? "Cancel compare" : "Compare tournaments"}
        </button>
        {compareMode && (
          <span className="subtitle">
            {compareIds.length < 2
              ? `Select ${2 - compareIds.length} more tournament${2 - compareIds.length === 1 ? "" : "s"}`
              : ""}
          </span>
        )}
        {compareIds.length === 2 && (
          <button
            className="new-team-btn"
            onClick={() => {
              setView({ kind: "compare", ids: [compareIds[0], compareIds[1]] });
              setCompareMode(false);
              setCompareIds([]);
            }}
          >
            Compare selected
          </button>
        )}
      </div>

      <div className="tournaments-facets">
        <div className="tournaments-facet-group">
          <span className="tournaments-facet-label">Format</span>
          {(["all", "m-c", "m-b", "m-a"] as const).map((f) => (
            <button
              key={f}
              className={formatFilter === f ? "facet-chip active" : "facet-chip"}
              onClick={() => setFormatFilter(f)}
            >
              {f === "all" ? "All" : f.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="tournaments-facet-group">
          <span className="tournaments-facet-label">Source</span>
          {(["all", "online", "in-person"] as const).map((s) => (
            <button
              key={s}
              className={sourceFilter === s ? "facet-chip active" : "facet-chip"}
              onClick={() => setSourceFilter(s)}
            >
              {s === "all" ? "All" : s === "online" ? "Online" : "In-person"}
            </button>
          ))}
        </div>

        <label className="tournaments-facet-group">
          <span className="tournaments-facet-label">Sort</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
            <option value="date">Newest first</option>
            <option value="players">Most players</option>
            <option value="results">Most results</option>
          </select>
        </label>

        {myTeams.length > 0 && (
          <label className="tournaments-facet-group">
            <span className="tournaments-facet-label">My team's Pokemon</span>
            <select value={myTeamId} onChange={(e) => setMyTeamId(e.target.value)}>
              <option value="">Off</option>
              {myTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {myTeamLoading && <span className="subtitle">Loading...</span>}
          </label>
        )}
      </div>

      {filterHits && (
        <div className="tournament-filter-hits">
          {filterHits.length === 0 ? (
            <p className="subtitle">No results feature that Pokemon.</p>
          ) : (
            filterHits.map((h) => (
              <button key={h.result_id} className="tournament-filter-hit" onClick={() => setView({ kind: "detail", id: h.tournament_id })}>
                <div>
                  <strong>{h.tournament_name}</strong> ({h.tournament_date}) - #{h.placement}
                  {h.player && ` · ${h.player}`}
                </div>
                <div className="tournament-result-roster">
                  {h.roster.map((slot) => (
                    <img key={slot.pokemon_name} src={slot.sprite_url ?? undefined} alt={slot.display_name} title={slot.display_name} />
                  ))}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {!tournaments ? (
        <p className="subtitle">Loading...</p>
      ) : tournaments.length === 0 ? (
        <p className="subtitle">No tournaments logged yet. Add one to get started.</p>
      ) : (
        (() => {
          const filtered = tournaments
            .filter((t) => !minPlayers || (t.player_count ?? 0) >= Number(minPlayers))
            .filter((t) => formatFilter === "all" || t.format === formatFilter)
            .filter(
              (t) =>
                sourceFilter === "all" ||
                (sourceFilter === "online" ? t.is_online : !t.is_online)
            )
            .filter((t) => !myTeamTournamentIds || myTeamTournamentIds.has(t.id))
            .sort((a, b) => {
              if (sortKey === "players") return (b.player_count ?? 0) - (a.player_count ?? 0);
              if (sortKey === "results") return b.result_count - a.result_count;
              return a.date < b.date ? 1 : -1;
            });

          function renderCard(t: TournamentSummary) {
            const selected = compareIds.includes(t.id);
            return (
              <button
                key={t.id}
                className={selected ? "tournament-card compare-selected" : "tournament-card"}
                onClick={() => {
                  if (compareMode) {
                    setCompareIds((prev) =>
                      prev.includes(t.id)
                        ? prev.filter((id) => id !== t.id)
                        : prev.length < 2
                        ? [...prev, t.id]
                        : prev
                    );
                  } else {
                    setView({ kind: "detail", id: t.id });
                  }
                }}
              >
                <strong>
                  {selected && "✓ "}
                  {t.name} {t.is_online && <span className="online-badge">Online</span>}
                </strong>
                <span className="subtitle">
                  {t.date}
                  {t.player_count != null && ` · ${t.player_count} players`} · {t.result_count} results
                </span>
              </button>
            );
          }

          if (viewMode === "timeline") {
            const groups = new Map<string, TournamentSummary[]>();
            for (const t of filtered) {
              const month = t.date.slice(0, 7);
              if (!groups.has(month)) groups.set(month, []);
              groups.get(month)!.push(t);
            }
            return (
              <div className="tournament-timeline">
                {Array.from(groups.entries()).map(([month, items]) => (
                  <div key={month} className="tournament-timeline-group">
                    <div className="tournament-timeline-month">
                      {month} <span className="subtitle">({items.length})</span>
                    </div>
                    <div className="tournament-list">{items.map(renderCard)}</div>
                  </div>
                ))}
              </div>
            );
          }

          const visible = filtered.slice(0, visibleCount);
          return (
            <>
              <div className="tournament-list">{visible.map(renderCard)}</div>
              {visibleCount < filtered.length && (
                <button className="tournament-show-more" onClick={() => setVisibleCount((c) => c + 24)}>
                  Show more ({filtered.length - visibleCount} remaining)
                </button>
              )}
            </>
          );
        })()
      )}
    </div>
  );
}

function TournamentForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: TournamentIn | null;
  onSave: (body: TournamentIn) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [playerCount, setPlayerCount] = useState(initial?.player_count?.toString() ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial?.source_url ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function handleSave() {
    if (!name.trim() || !date.trim()) return;
    onSave({
      name: name.trim(),
      date: date.trim(),
      player_count: playerCount ? Number(playerCount) : null,
      source_url: sourceUrl.trim() || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <div className="tournaments-page">
      <button className="back-btn" onClick={onCancel}>
        ← Back
      </button>
      <h3>{initial ? "Edit Tournament" : "New Tournament"}</h3>
      <div className="tournament-form">
        <label className="field">
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pokemon Champions World Championship 2026" />
        </label>
        <label className="field">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          Player count
          <input type="number" min={0} value={playerCount} onChange={(e) => setPlayerCount(e.target.value)} placeholder="Optional" />
        </label>
        <label className="field">
          Source link
          <input type="text" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Optional - bracket/liquipedia URL" />
        </label>
        <label className="field">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional" />
        </label>
        <div className="tournament-result-actions">
          <button className="new-team-btn" onClick={handleSave} disabled={!name.trim() || !date.trim()}>
            Save
          </button>
          <button className="import-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const TIER_LABELS: Record<string, string> = { international: "Internationals", regionals: "Regionals" };

/** A player's career stats (money won, points, top cuts by tier) and their
 *  full tournament history across every event this app has tracked -
 *  reads straight from our own already-loaded results, not a fresh scrape. */
function PlayerView({
  externalId,
  onBack,
  onOpenTournament,
}: {
  externalId: string;
  onBack: () => void;
  onOpenTournament: (tournamentId: number) => void;
}) {
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPlayer(null);
    setError(null);
    getPlayer(externalId)
      .then(setPlayer)
      .catch(() => setError("Couldn't load this player. Is the backend running?"));
  }, [externalId]);

  return (
    <div className="tournaments-page">
      <button className="back-btn" onClick={onBack}>
        ← Back
      </button>
      {error && <p className="error-banner">{error}</p>}
      {!player ? (
        <p className="subtitle">Loading...</p>
      ) : (
        <>
          <h2>
            {player.name} {player.country && <span className="subtitle">({player.country})</span>}
          </h2>
          <p className="subtitle">
            {player.money_won && `${player.money_won} won`}
            {player.money_won && player.points_earned != null && " · "}
            {player.points_earned != null && `${player.points_earned} championship points`}
          </p>

          {Object.keys(player.top_cuts).length > 0 && (
            <div className="tournament-most-brought-list">
              {Object.entries(player.top_cuts).map(([tier, cuts]) => (
                <div className="tournament-most-brought-entry" key={tier}>
                  <span>{TIER_LABELS[tier] ?? titleCase(tier)}</span>
                  <span className="tournament-most-brought-count">
                    {cuts["1st"]}x 1st, {cuts["2nd"]}x 2nd, {cuts.t4}x T4, {cuts.t8}x T8 ({cuts.total} top cuts)
                  </span>
                </div>
              ))}
            </div>
          )}

          <h3>Tournament history ({player.results.length})</h3>
          <div className="tournament-results-list">
            {player.results.map((r) => (
              <div className="tournament-result-card" key={r.tournament_id}>
                <button className="tournament-player-history-row" onClick={() => onOpenTournament(r.tournament_id)}>
                  <span className="tournament-result-placement">#{r.placement}</span>
                  <strong>{r.tournament_name}</strong>
                  <span className="subtitle">{r.tournament_date}</span>
                  {(r.prize_money || r.points != null) && (
                    <span className="tournament-result-payout">
                      {[r.prize_money, r.points != null ? `${r.points} pts` : null].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  <div className="tournament-result-roster">
                    {r.roster.map((slot) => (
                      <img key={slot.pokemon_name} src={slot.sprite_url ?? undefined} alt={slot.display_name} title={slot.display_name} />
                    ))}
                  </div>
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
