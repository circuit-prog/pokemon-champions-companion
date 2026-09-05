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
  | { kind: "player"; externalId: string; back: View };

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
    } else if (view.kind === "detail") {
      refreshDetail(view.id);
    }
  }, [view]);

  useEffect(() => {
    if (!filter.trim()) {
      setFilterHits(null);
      return;
    }
    const handle = setTimeout(() => {
      searchTournamentsByPokemon(filter.trim().toLowerCase().replace(/\s+/g, "-"))
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

        <div className="tournament-results-list">
          {detail.results.map((r) => {
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
        <div className="tournament-list">
          {tournaments
            .filter((t) => !minPlayers || (t.player_count ?? 0) >= Number(minPlayers))
            .map((t) => (
            <button key={t.id} className="tournament-card" onClick={() => setView({ kind: "detail", id: t.id })}>
              <strong>
                {t.name} {t.is_online && <span className="online-badge">Online</span>}
              </strong>
              <span className="subtitle">
                {t.date}
                {t.player_count != null && ` · ${t.player_count} players`} · {t.result_count} results
              </span>
            </button>
          ))}
        </div>
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
