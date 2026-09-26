import { useEffect, useState } from "react";
import {
  getPracticeGames,
  getPracticeGame,
  getPracticeStats,
  createPracticeGame,
  updatePracticeGame,
  deletePracticeGame,
  addPracticeTurn,
  deletePracticeTurn,
  searchPokemon,
  getPokemon,
} from "../api";
import type {
  PracticeGameSummary,
  PracticeGame,
  PracticeStats,
  PracticeTurnIn,
  DamageCategory,
  PracticeResult,
  PracticeMode,
  PokemonSummary,
  MoveOut,
} from "../api";
import { loadTeams } from "../teamStorage";
import type { SavedTeam } from "../teamStorage";
import "./PracticePage.css";

type View =
  | { kind: "list" }
  | { kind: "new-game" }
  | { kind: "live-game"; gameId: number }
  | { kind: "detail"; gameId: number };

const DAMAGE_LABELS: Record<DamageCategory, string> = {
  big: "Big hit",
  normal: "Normal",
  weak: "Weak",
  miss: "Miss",
};
const DAMAGE_OPTIONS: DamageCategory[] = ["big", "normal", "weak", "miss"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function DamageChips({
  value,
  onChange,
}: {
  value: DamageCategory | null | undefined;
  onChange: (v: DamageCategory) => void;
}) {
  return (
    <div className="practice-damage-chips">
      {DAMAGE_OPTIONS.map((d) => (
        <button
          key={d}
          type="button"
          className={value === d ? "facet-chip active" : "facet-chip"}
          onClick={() => onChange(d)}
        >
          {DAMAGE_LABELS[d]}
        </button>
      ))}
    </div>
  );
}

/** Free-text opponent Pokemon lookup - the opponent's team isn't known in
 *  advance, so this has to search the dex rather than offer a fixed list. */
function OpponentPicker({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (slug: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState(value ? titleCase(value) : "");
  const [suggestions, setSuggestions] = useState<PokemonSummary[]>([]);

  useEffect(() => {
    if (!query.trim() || query === titleCase(value)) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(() => {
      searchPokemon(query.trim())
        .then((results) => setSuggestions(results.slice(0, 6)))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, value]);

  return (
    <div className="practice-opponent-picker">
      <input
        className="practice-input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!e.target.value.trim()) onChange("");
        }}
      />
      {suggestions.length > 0 && (
        <div className="practice-suggestions">
          {suggestions.map((p) => (
            <button
              key={p.name}
              type="button"
              className="practice-suggestion"
              onClick={() => {
                onChange(p.name);
                setQuery(p.display_name);
                setSuggestions([]);
              }}
            >
              <img src={p.sprite_url ?? undefined} alt="" />
              {p.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface SlotState {
  pokemon: string;
  move: string;
  damage: DamageCategory | null;
  fainted: boolean;
  switchIn: string;
}
const EMPTY_SLOT: SlotState = { pokemon: "", move: "", damage: null, fainted: false, switchIn: "" };
/** What carries over to the next turn: who is out stays, per-turn specifics clear. */
const nextTurnSlot = (s: SlotState): SlotState => ({ ...EMPTY_SLOT, pokemon: s.switchIn || (s.fainted ? "" : s.pokemon) });

function modeLabel(m: PracticeMode): string {
  return m === "doubles" ? "Doubles" : "Singles";
}

/** One of my active Pokemon (slot A, or slot B in doubles). */
function MySlotForm({
  title,
  slot,
  onChange,
  roster,
  team,
}: {
  title: string;
  slot: SlotState;
  onChange: (s: SlotState) => void;
  roster: PracticeGame["my_roster"];
  team: SavedTeam | null;
}) {
  const teamSlot = team?.slots.find((s) => s.pokemon.name === slot.pokemon);
  const moveOptions = teamSlot?.moves ?? teamSlot?.pokemon.moves.map((m) => m.name) ?? [];
  const moveDisplay = (slug: string) =>
    teamSlot?.pokemon.moves.find((m) => m.name === slug)?.display_name ?? titleCase(slug);
  return (
    <div className="practice-turn-side">
      <div className="practice-turn-side-title">{title}</div>
      <label className="tournaments-facet-group">
        <span className="tournaments-facet-label">Pokemon</span>
        <select value={slot.pokemon} onChange={(e) => onChange({ ...slot, pokemon: e.target.value, move: "" })}>
          <option value="">-</option>
          {roster.map((p) => (
            <option key={p.pokemon_name} value={p.pokemon_name}>
              {p.display_name}
            </option>
          ))}
        </select>
      </label>
      <label className="tournaments-facet-group">
        <span className="tournaments-facet-label">Move</span>
        <select value={slot.move} onChange={(e) => onChange({ ...slot, move: e.target.value })} disabled={!slot.pokemon}>
          <option value="">-</option>
          {moveOptions.map((m) => (
            <option key={m} value={m}>
              {moveDisplay(m)}
            </option>
          ))}
        </select>
      </label>
      <DamageChips value={slot.damage} onChange={(d) => onChange({ ...slot, damage: d })} />
      <label className="tournaments-facet-group">
        <span className="tournaments-facet-label">Switch in</span>
        <select value={slot.switchIn} onChange={(e) => onChange({ ...slot, switchIn: e.target.value })}>
          <option value="">None</option>
          {roster.map((p) => (
            <option key={p.pokemon_name} value={p.pokemon_name}>
              {p.display_name}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={slot.fainted} onChange={(e) => onChange({ ...slot, fainted: e.target.checked })} />
        Fainted this turn
      </label>
    </div>
  );
}

/** One of the opponent's active Pokemon. Fetches its learnset itself. */
function OpponentSlotForm({
  title,
  slot,
  onChange,
}: {
  title: string;
  slot: SlotState;
  onChange: (s: SlotState) => void;
}) {
  const [moves, setMoves] = useState<MoveOut[]>([]);
  useEffect(() => {
    if (!slot.pokemon) {
      setMoves([]);
      return;
    }
    getPokemon(slot.pokemon)
      .then((p) => setMoves(p.moves))
      .catch(() => setMoves([]));
  }, [slot.pokemon]);
  return (
    <div className="practice-turn-side">
      <div className="practice-turn-side-title">{title}</div>
      <label className="tournaments-facet-group">
        <span className="tournaments-facet-label">Pokemon</span>
        <OpponentPicker value={slot.pokemon} onChange={(v) => onChange({ ...slot, pokemon: v, move: "" })} placeholder="Search..." />
      </label>
      <label className="tournaments-facet-group">
        <span className="tournaments-facet-label">Move</span>
        <select value={slot.move} onChange={(e) => onChange({ ...slot, move: e.target.value })} disabled={!slot.pokemon}>
          <option value="">-</option>
          {moves.map((m) => (
            <option key={m.name} value={m.name}>
              {m.display_name}
            </option>
          ))}
        </select>
      </label>
      <DamageChips value={slot.damage} onChange={(d) => onChange({ ...slot, damage: d })} />
      <label className="tournaments-facet-group">
        <span className="tournaments-facet-label">Switch in</span>
        <OpponentPicker value={slot.switchIn} onChange={(v) => onChange({ ...slot, switchIn: v })} placeholder="If they switched..." />
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={slot.fainted} onChange={(e) => onChange({ ...slot, fainted: e.target.checked })} />
        Fainted this turn
      </label>
    </div>
  );
}

/** "Garchomp used Earthquake (Big hit) - fainted -> switched to X" for one active slot. */
function slotText(
  name: string | null,
  move: string | null | undefined,
  damage: DamageCategory | null | undefined,
  fainted: boolean | undefined,
  switchName: string | null,
): string {
  return (
    `${name ?? "?"}` +
    (move ? ` used ${titleCase(move)}` : "") +
    (damage ? ` (${DAMAGE_LABELS[damage]})` : "") +
    (fainted ? " - fainted" : "") +
    (switchName ? ` → switched to ${switchName}` : "")
  );
}

function TurnSides({ t, doubles }: { t: PracticeGame["turns"][number]; doubles: boolean }) {
  return (
    <>
      <span>
        {slotText(t.my_pokemon_display_name, t.my_move, t.my_damage, t.my_fainted, t.my_switch_in_display_name)}
        {doubles &&
          " & " +
            slotText(t.my_pokemon_b_display_name, t.my_move_b, t.my_damage_b, t.my_fainted_b, t.my_switch_in_b_display_name)}
      </span>
      <span className="practice-turn-vs">vs</span>
      <span>
        {slotText(t.opponent_pokemon_display_name, t.opponent_move, t.opponent_damage, t.opponent_fainted, t.opponent_switch_in_display_name)}
        {doubles &&
          " & " +
            slotText(
              t.opponent_pokemon_b_display_name,
              t.opponent_move_b,
              t.opponent_damage_b,
              t.opponent_fainted_b,
              t.opponent_switch_in_b_display_name,
            )}
      </span>
    </>
  );
}

function StatsPanel({ stats }: { stats: PracticeStats }) {
  return (
    <div className="practice-stats-panel">
      <div className="practice-stats-summary">
        <div className="stats-placement-item">
          <div className="stats-placement-value">
            {stats.current_streak.type
              ? `${stats.current_streak.length} ${stats.current_streak.type === "win" ? "W" : "L"}`
              : "-"}
          </div>
          <div className="stats-placement-label">Current streak</div>
        </div>
        <div className="stats-placement-item">
          <div className="stats-placement-value">{stats.best_win_streak}</div>
          <div className="stats-placement-label">Best win streak</div>
        </div>
      </div>

      {stats.by_team.length > 0 && (
        <div className="practice-stats-section">
          <div className="stats-section-title">Win rate by team</div>
          <div className="stats-entry-list">
            {stats.by_team.map((t) => (
              <div key={t.team_name} className="stats-entry-row">
                <span className="stats-entry-name">{t.team_name}</span>
                <span className="subtitle">
                  {t.wins}/{t.games}
                </span>
                <span className="stats-entry-percent">{t.win_rate}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.over_time.length > 0 && (
        <div className="practice-stats-section">
          <div className="stats-section-title">Win rate over time</div>
          <div className="tournament-trend-bars">
            {stats.over_time.map((p) => (
              <div
                key={p.game_id}
                className="tournament-trend-bar-row"
                title={`${p.date}: ${p.result} (${p.win_rate_so_far}% overall)`}
              >
                <span className="tournament-trend-date">{p.date}</span>
                <div className="tournament-trend-bar-track">
                  <div
                    className={`tournament-trend-bar-fill ${p.result === "loss" ? "practice-bar-loss" : ""}`}
                    style={{ width: `${Math.max(p.win_rate_so_far, 1)}%` }}
                  />
                </div>
                <span className="tournament-trend-percent">{p.win_rate_so_far}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stats-grid">
        {stats.vs_opponent_pokemon.length > 0 && (
          <div className="stats-section">
            <div className="stats-section-title">Best/worst matchups faced</div>
            <div className="stats-entry-list">
              {stats.vs_opponent_pokemon.map((p) => (
                <div key={p.pokemon_name} className="stats-entry-row">
                  <img src={p.sprite_url ?? undefined} alt={p.display_name} />
                  <span className="stats-entry-name">{p.display_name}</span>
                  <span className="subtitle">
                    {p.wins}/{p.games}
                  </span>
                  <span className="stats-entry-percent">{p.win_rate}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats.by_own_pokemon.length > 0 && (
          <div className="stats-section">
            <div className="stats-section-title">Win rate with each Pokemon</div>
            <div className="stats-entry-list">
              {stats.by_own_pokemon.map((p) => (
                <div key={p.pokemon_name} className="stats-entry-row">
                  <img src={p.sprite_url ?? undefined} alt={p.display_name} />
                  <span className="stats-entry-name">{p.display_name}</span>
                  <span className="subtitle">
                    {p.wins}/{p.games}
                  </span>
                  <span className="stats-entry-percent">{p.win_rate}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats.damage_leaders.length > 0 && (
          <div className="stats-section">
            <div className="stats-section-title">Hits hardest most often</div>
            <div className="stats-entry-list">
              {stats.damage_leaders.map((p) => (
                <div key={p.pokemon_name} className="stats-entry-row">
                  <img src={p.sprite_url ?? undefined} alt={p.display_name} />
                  <span className="stats-entry-name">{p.display_name}</span>
                  <span className="stats-entry-percent">
                    {p.big_hits}/{p.total_hits} big hits
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NewGameView({ onCreated, onCancel }: { onCreated: (g: PracticeGame) => void; onCancel: () => void }) {
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [teamId, setTeamId] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<PracticeMode>("singles");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTeams(loadTeams());
  }, []);

  const team = teams.find((t) => t.id === teamId);

  function handleStart() {
    if (!team) return;
    setError(null);
    createPracticeGame({
      date: todayIso(),
      my_team_name: team.name,
      my_roster: team.slots.map((s) => s.pokemon.name),
      mode,
      notes: notes.trim() || null,
    })
      .then(onCreated)
      .catch(() => setError("Couldn't start a new game. Is the backend running?"));
  }

  return (
    <div className="practice-new-game">
      <h3>New practice game</h3>
      {error && <p className="error-banner">{error}</p>}
      {teams.length === 0 ? (
        <p className="subtitle">No saved teams yet - build one in Teams first.</p>
      ) : (
        <>
          <div className="tournaments-facet-group">
            <span className="tournaments-facet-label">Format</span>
            {(["singles", "doubles"] as const).map((m) => (
              <button key={m} className={mode === m ? "facet-chip active" : "facet-chip"} onClick={() => setMode(m)}>
                {modeLabel(m)}
              </button>
            ))}
          </div>
          <label className="tournaments-facet-group">
            <span className="tournaments-facet-label">Team</span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Choose a team...</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <textarea
            className="practice-textarea"
            placeholder="Notes (optional)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="practice-actions">
            <button onClick={handleStart} disabled={!team}>
              Start logging
            </button>
            <button onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

function LiveGameView({
  gameId,
  onFinished,
  onBack,
}: {
  gameId: number;
  onFinished: () => void;
  onBack: () => void;
}) {
  const [game, setGame] = useState<PracticeGame | null>(null);
  const [myTeam, setMyTeam] = useState<SavedTeam | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [myA, setMyA] = useState<SlotState>(EMPTY_SLOT);
  const [myB, setMyB] = useState<SlotState>(EMPTY_SLOT);
  const [oppA, setOppA] = useState<SlotState>(EMPTY_SLOT);
  const [oppB, setOppB] = useState<SlotState>(EMPTY_SLOT);

  const [fieldNotes, setFieldNotes] = useState("");

  const [showFinish, setShowFinish] = useState(false);
  const [result, setResult] = useState<PracticeResult>("win");
  const [replayLink, setReplayLink] = useState("");
  const [notes, setNotes] = useState("");

  function refresh() {
    getPracticeGame(gameId)
      .then((g) => {
        setGame(g);
        setReplayLink(g.replay_link ?? "");
        setNotes(g.notes ?? "");
      })
      .catch(() => setError("Couldn't load this game."));
  }

  useEffect(() => {
    refresh();
    const teams = loadTeams();
    getPracticeGame(gameId).then((g) => {
      setMyTeam(teams.find((t) => t.name === g.my_team_name) ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  if (!game) return <p className="subtitle">Loading...</p>;

  const doubles = game.mode === "doubles";

  function logTurn() {
    const body: PracticeTurnIn = {
      my_pokemon: myA.pokemon || null,
      my_move: myA.move || null,
      my_damage: myA.damage,
      my_fainted: myA.fainted,
      my_switch_in: myA.switchIn || null,
      opponent_pokemon: oppA.pokemon || null,
      opponent_move: oppA.move || null,
      opponent_damage: oppA.damage,
      opponent_fainted: oppA.fainted,
      opponent_switch_in: oppA.switchIn || null,
      field_notes: fieldNotes.trim() || null,
    };
    if (doubles) {
      Object.assign(body, {
        my_pokemon_b: myB.pokemon || null,
        my_move_b: myB.move || null,
        my_damage_b: myB.damage,
        my_fainted_b: myB.fainted,
        my_switch_in_b: myB.switchIn || null,
        opponent_pokemon_b: oppB.pokemon || null,
        opponent_move_b: oppB.move || null,
        opponent_damage_b: oppB.damage,
        opponent_fainted_b: oppB.fainted,
        opponent_switch_in_b: oppB.switchIn || null,
      });
    }
    addPracticeTurn(gameId, body)
      .then(() => {
        // Keep the active Pokemon selections (usually still the same ones
        // out next turn) but clear the per-turn specifics.
        setMyA(nextTurnSlot(myA));
        setMyB(nextTurnSlot(myB));
        setOppA(nextTurnSlot(oppA));
        setOppB(nextTurnSlot(oppB));
        setFieldNotes("");
        refresh();
      })
      .catch(() => setError("Couldn't log that turn."));
  }

  function removeTurn(turnNumber: number) {
    deletePracticeTurn(gameId, turnNumber)
      .then(refresh)
      .catch(() => setError("Couldn't delete that turn."));
  }

  function finishGame() {
    updatePracticeGame(gameId, { result, replay_link: replayLink.trim() || null, notes: notes.trim() || null })
      .then(() => onFinished())
      .catch(() => setError("Couldn't save the result."));
  }

  return (
    <div className="practice-live-game">
      <button className="back-btn" onClick={onBack}>
        ← Practice
      </button>
      <h3>
        {game.my_team_name} - Turn {game.turns.length + 1}
      </h3>
      {error && <p className="error-banner">{error}</p>}

      <div className={doubles ? "practice-turn-form practice-turn-form-doubles" : "practice-turn-form"}>
        <MySlotForm title={doubles ? "You - Slot A" : "You"} slot={myA} onChange={setMyA} roster={game.my_roster} team={myTeam} />
        <OpponentSlotForm title={doubles ? "Opponent - Slot A" : "Opponent"} slot={oppA} onChange={setOppA} />
        {doubles && (
          <>
            <MySlotForm title="You - Slot B" slot={myB} onChange={setMyB} roster={game.my_roster} team={myTeam} />
            <OpponentSlotForm title="Opponent - Slot B" slot={oppB} onChange={setOppB} />
          </>
        )}
      </div>

      <input
        className="practice-input practice-field-notes"
        placeholder="Field notes (weather, terrain, status)..."
        value={fieldNotes}
        onChange={(e) => setFieldNotes(e.target.value)}
      />

      <div className="practice-actions">
        <button onClick={logTurn}>+ Log turn</button>
        <button onClick={() => setShowFinish((s) => !s)}>{showFinish ? "Cancel finish" : "Finish game"}</button>
      </div>

      {showFinish && (
        <div className="practice-finish-form">
          <div className="tournaments-facet-group">
            <span className="tournaments-facet-label">Result</span>
            {(["win", "loss"] as const).map((r) => (
              <button
                key={r}
                className={result === r ? "facet-chip active" : "facet-chip"}
                onClick={() => setResult(r)}
              >
                {r === "win" ? "Win" : "Loss"}
              </button>
            ))}
          </div>
          <input
            className="practice-input"
            placeholder="Replay link (optional)"
            value={replayLink}
            onChange={(e) => setReplayLink(e.target.value)}
          />
          <textarea
            className="practice-textarea"
            placeholder="Notes (optional)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button onClick={finishGame}>Save &amp; finish</button>
        </div>
      )}

      {game.turns.length > 0 && (
        <div className="practice-turn-log">
          <div className="stats-section-title">Turns logged</div>
          {[...game.turns].reverse().map((t) => (
            <div key={t.id} className="practice-turn-row">
              <span className="practice-turn-number">#{t.turn_number}</span>
              <TurnSides t={t} doubles={game.mode === "doubles"} />
              {t.field_notes && <span className="subtitle">{t.field_notes}</span>}
              <button className="danger" onClick={() => removeTurn(t.turn_number)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailView({ gameId, onBack, onResume }: { gameId: number; onBack: () => void; onResume: () => void }) {
  const [game, setGame] = useState<PracticeGame | null>(null);

  useEffect(() => {
    getPracticeGame(gameId).then(setGame);
  }, [gameId]);

  if (!game) return <p className="subtitle">Loading...</p>;

  return (
    <div className="practice-detail">
      <button className="back-btn" onClick={onBack}>
        ← Practice
      </button>
      <h3>
        {game.my_team_name} - {game.date} <span className="dark-horse-badge">{modeLabel(game.mode)}</span>
        {game.result && (
          <span className={game.result === "win" ? "online-badge" : "dark-horse-badge"}>
            {game.result === "win" ? "Win" : "Loss"}
          </span>
        )}
      </h3>
      {!game.result && <button onClick={onResume}>Resume logging</button>}
      {game.replay_link && (
        <p>
          <a href={game.replay_link} target="_blank" rel="noreferrer">
            Replay
          </a>
        </p>
      )}
      {game.notes && <p className="tournament-notes">{game.notes}</p>}

      <div className="tournament-result-roster">
        {game.opponent_roster.map((p) => (
          <img key={p.pokemon_name} src={p.sprite_url ?? undefined} alt={p.display_name} title={p.display_name} />
        ))}
      </div>

      {game.turns.length > 0 && (
        <div className="practice-turn-log">
          <div className="stats-section-title">Turns</div>
          {game.turns.map((t) => (
            <div key={t.id} className="practice-turn-row">
              <span className="practice-turn-number">#{t.turn_number}</span>
              <TurnSides t={t} doubles={game.mode === "doubles"} />
              {t.field_notes && <span className="subtitle">{t.field_notes}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PracticePage() {
  const [view, setView] = useState<View>({ kind: "list" });
  const [games, setGames] = useState<PracticeGameSummary[] | null>(null);
  const [stats, setStats] = useState<PracticeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [opponentFilter, setOpponentFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [resultFilter, setResultFilter] = useState<"all" | PracticeResult>("all");
  const [modeFilter, setModeFilter] = useState<"all" | PracticeMode>("all");
  const [myTeams, setMyTeams] = useState<SavedTeam[]>([]);

  function refreshList() {
    getPracticeGames({
      opponent: opponentFilter.trim() ? opponentFilter.trim().toLowerCase().replace(/\s+/g, "-") : undefined,
      team: teamFilter || undefined,
      result: resultFilter === "all" ? undefined : resultFilter,
      mode: modeFilter === "all" ? undefined : modeFilter,
    })
      .then(setGames)
      .catch(() => setError("Couldn't reach the backend."));
    getPracticeStats(modeFilter === "all" ? undefined : modeFilter).then(setStats).catch(() => setStats(null));
  }

  useEffect(() => {
    if (view.kind === "list") {
      setMyTeams(loadTeams());
      const handle = setTimeout(refreshList, 250);
      return () => clearTimeout(handle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, opponentFilter, teamFilter, resultFilter, modeFilter]);

  function removeGame(id: number) {
    deletePracticeGame(id)
      .then(refreshList)
      .catch(() => setError("Couldn't delete that game."));
  }

  if (view.kind === "new-game") {
    return (
      <div className="practice-page">
        <NewGameView
          onCreated={(g) => setView({ kind: "live-game", gameId: g.id })}
          onCancel={() => setView({ kind: "list" })}
        />
      </div>
    );
  }

  if (view.kind === "live-game") {
    return (
      <div className="practice-page">
        <LiveGameView
          gameId={view.gameId}
          onFinished={() => setView({ kind: "detail", gameId: view.gameId })}
          onBack={() => setView({ kind: "list" })}
        />
      </div>
    );
  }

  if (view.kind === "detail") {
    return (
      <div className="practice-page">
        <DetailView
          gameId={view.gameId}
          onBack={() => setView({ kind: "list" })}
          onResume={() => setView({ kind: "live-game", gameId: view.gameId })}
        />
      </div>
    );
  }

  return (
    <div className="practice-page">
      <h2>Practice</h2>
      <p className="subtitle">Log your own games, turn by turn, and see how you're really doing.</p>
      {error && <p className="error-banner">{error}</p>}

      {stats && stats.by_team.length > 0 && <StatsPanel stats={stats} />}

      <div className="practice-list-header">
        <input
          className="practice-input"
          placeholder="Filter by opponent Pokemon..."
          value={opponentFilter}
          onChange={(e) => setOpponentFilter(e.target.value)}
        />
        {myTeams.length > 0 && (
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="">All teams</option>
            {Array.from(new Set(myTeams.map((t) => t.name))).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        {(["all", "win", "loss"] as const).map((r) => (
          <button
            key={r}
            className={resultFilter === r ? "facet-chip active" : "facet-chip"}
            onClick={() => setResultFilter(r)}
          >
            {r === "all" ? "All" : r === "win" ? "Win" : "Loss"}
          </button>
        ))}
        {(["all", "singles", "doubles"] as const).map((m) => (
          <button
            key={m}
            className={modeFilter === m ? "facet-chip active" : "facet-chip"}
            onClick={() => setModeFilter(m)}
          >
            {m === "all" ? "All formats" : modeLabel(m)}
          </button>
        ))}
        <button className="new-team-btn" onClick={() => setView({ kind: "new-game" })}>
          + New Game
        </button>
      </div>

      {!games ? (
        <p className="subtitle">Loading...</p>
      ) : games.length === 0 ? (
        <p className="subtitle">No practice games logged yet. Start one to begin tracking.</p>
      ) : (
        <div className="tournament-list">
          {games.map((g) => (
            <div key={g.id} className="tournament-card practice-game-card">
              <button className="practice-game-card-btn" onClick={() => setView({ kind: "detail", gameId: g.id })}>
                <strong>
                  {g.my_team_name}{" "}
                  {g.result ? (
                    <span className={g.result === "win" ? "online-badge" : "dark-horse-badge"}>
                      {g.result === "win" ? "Win" : "Loss"}
                    </span>
                  ) : (
                    <span className="dark-horse-badge">In progress</span>
                  )}
                </strong>
                <span className="subtitle">
                  {g.date} · {modeLabel(g.mode)} · {g.turn_count} turns
                </span>
                <div className="tournament-result-roster">
                  {g.opponent_roster.map((p) => (
                    <img key={p.pokemon_name} src={p.sprite_url ?? undefined} alt={p.display_name} title={p.display_name} />
                  ))}
                </div>
              </button>
              <button className="danger practice-delete-btn" onClick={() => removeGame(g.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
