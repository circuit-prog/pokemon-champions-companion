import { useEffect, useState } from "react";
import { searchPokemon, getPokemon, searchItems, getPokemonUsage } from "../api";
import type { PokemonSummary, PokemonDetail, ItemOut, PokemonUsageOut } from "../api";
import { NATURE_NAMES, MAX_EV_PER_STAT, type StatKey } from "../natures";
import { statAtLevel } from "../statCalc";
import "./TeamBuilder.css";

const TEAM_SIZE = 6;
const STAT_KEYS: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_LABELS: Record<StatKey, string> = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };

type EvSpread = Record<StatKey, number>;

const EMPTY_EVS: EvSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

interface TeamSlot {
  pokemon: PokemonDetail;
  ability: string;
  item: string;
  nature: string;
  evs: EvSpread;
  moves: string[]; // up to 4 move names
  usage: PokemonUsageOut | null; // null = not yet loaded, or confirmed no usage data
}

function PokemonSearch({ onPick }: { onPick: (p: PokemonSummary) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PokemonSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Debounce: wait 250ms after typing stops before hitting the API,
    // so we don't fire a request on every single keystroke.
    const handle = setTimeout(() => {
      setLoading(true);
      searchPokemon(query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="pokemon-search">
      <input
        type="text"
        placeholder="Search Pokemon by name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && <div className="search-status">Searching...</div>}
      <div className="search-results">
        {results.map((p) => (
          <button key={p.id} className="search-result" onClick={() => onPick(p)}>
            {p.sprite_url && <img src={p.sprite_url} alt={p.display_name} />}
            <span>{p.display_name}</span>
            <span className="types">
              {p.type1}
              {p.type2 ? ` / ${p.type2}` : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ItemSearch({
  value,
  effect,
  onPick,
}: {
  value: string;
  effect: string | null;
  onPick: (itemName: string, effect: string | null) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<ItemOut[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (!query) {
        setResults([]);
        return;
      }
      searchItems(query).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="item-search">
      <input
        type="text"
        placeholder="Search held item..."
        title={effect ?? undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="item-search-results">
          {results.map((item) => (
            <button
              key={item.id}
              title={item.effect ?? undefined}
              onClick={() => {
                onPick(item.name, item.effect);
                setQuery(item.display_name);
                setOpen(false);
              }}
            >
              {item.sprite_url && <img src={item.sprite_url} alt="" />}
              {item.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatRow({
  statKey,
  base,
  ev,
  nature,
  onChangeEv,
}: {
  statKey: StatKey;
  base: number;
  ev: number;
  nature: string;
  onChangeEv: (value: number) => void;
}) {
  const final = statAtLevel(base, ev, 50, statKey, nature);
  return (
    <div className="stat-row">
      <span className="stat-label">{STAT_LABELS[statKey]}</span>
      <input
        type="number"
        min={0}
        max={MAX_EV_PER_STAT}
        value={ev}
        onChange={(e) => {
          const clamped = Math.max(0, Math.min(MAX_EV_PER_STAT, Number(e.target.value) || 0));
          onChangeEv(clamped);
        }}
      />
      <span className="stat-final">{final}</span>
    </div>
  );
}

function UsagePanel({ usage }: { usage: PokemonUsageOut | null }) {
  if (!usage) {
    return <div className="usage-panel usage-panel-empty">No tracked competitive usage data yet.</div>;
  }
  const top = (entries: PokemonUsageOut["moves"]) => entries.slice(0, 3);
  return (
    <div className="usage-panel">
      <div className="usage-header">
        Meta usage: #{usage.rank}
        {usage.usage_percent != null ? ` (${usage.usage_percent}% of teams)` : ""}
      </div>
      <div className="usage-columns">
        <div>
          <span className="usage-col-label">Top moves</span>
          {top(usage.moves).map((m) => (
            <div key={m.name} className="usage-entry">
              {m.name} <span>{m.percent}%</span>
            </div>
          ))}
        </div>
        <div>
          <span className="usage-col-label">Top items</span>
          {top(usage.items).map((m) => (
            <div key={m.name} className="usage-entry">
              {m.name} <span>{m.percent}%</span>
            </div>
          ))}
        </div>
        <div>
          <span className="usage-col-label">Top abilities</span>
          {top(usage.abilities).map((m) => (
            <div key={m.name} className="usage-entry">
              {m.name} <span>{m.percent}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamSlotCard({
  slot,
  onRemove,
  onChangeAbility,
  onChangeItem,
  onChangeNature,
  onChangeEv,
  onChangeMove,
}: {
  slot: TeamSlot;
  onRemove: () => void;
  onChangeAbility: (ability: string) => void;
  onChangeItem: (item: string, effect: string | null) => void;
  onChangeNature: (nature: string) => void;
  onChangeEv: (statKey: StatKey, value: number) => void;
  onChangeMove: (index: number, moveName: string) => void;
}) {
  const { pokemon } = slot;
  const evTotal = STAT_KEYS.reduce((sum, k) => sum + slot.evs[k], 0);
  const evMaxTotal = MAX_EV_PER_STAT * STAT_KEYS.length;
  const selectedAbility = pokemon.abilities.find((a) => a.name === slot.ability);

  return (
    <div className="team-slot-card">
      <div className="team-slot-header">
        {pokemon.sprite_url && <img src={pokemon.sprite_url} alt={pokemon.display_name} />}
        <div>
          <h3>{pokemon.display_name}</h3>
          <span className="types">
            {pokemon.type1}
            {pokemon.type2 ? ` / ${pokemon.type2}` : ""}
          </span>
        </div>
        <button className="remove-btn" onClick={onRemove} aria-label="Remove from team">
          ✕
        </button>
      </div>

      <UsagePanel usage={slot.usage} />

      <label className="field">
        Item
        <ItemSearch value={slot.item} effect={null} onPick={onChangeItem} />
      </label>

      <label className="field">
        Ability
        <select
          value={slot.ability}
          title={selectedAbility?.effect ?? undefined}
          onChange={(e) => onChangeAbility(e.target.value)}
        >
          <option value="">-- choose ability --</option>
          {pokemon.abilities.map((a) => (
            <option key={a.id} value={a.name} title={a.effect ?? undefined}>
              {a.display_name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        Nature
        <select value={slot.nature} onChange={(e) => onChangeNature(e.target.value)}>
          {NATURE_NAMES.map((n) => (
            <option key={n} value={n}>
              {n[0].toUpperCase() + n.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <div className="stats">
        <div className="stats-header">
          <span />
          <span>EV (0-{MAX_EV_PER_STAT})</span>
          <span>Stat</span>
        </div>
        {STAT_KEYS.map((k) => (
          <StatRow
            key={k}
            statKey={k}
            base={
              k === "hp" ? pokemon.hp
              : k === "atk" ? pokemon.attack
              : k === "def" ? pokemon.defense
              : k === "spa" ? pokemon.special_attack
              : k === "spd" ? pokemon.special_defense
              : pokemon.speed
            }
            ev={slot.evs[k]}
            nature={slot.nature}
            onChangeEv={(v) => onChangeEv(k, v)}
          />
        ))}
        <div className="ev-total">
          EV total: {evTotal}/{evMaxTotal}
        </div>
      </div>

      <div className="moves">
        {[0, 1, 2, 3].map((i) => {
          const selectedMove = pokemon.moves.find((m) => m.name === slot.moves[i]);
          return (
            <label className="field" key={i}>
              Move {i + 1}
              <select
                value={slot.moves[i] ?? ""}
                title={selectedMove?.effect ?? undefined}
                onChange={(e) => onChangeMove(i, e.target.value)}
              >
                <option value="">-- choose move --</option>
                {pokemon.moves.map((m) => (
                  <option key={m.id} value={m.name} title={m.effect ?? undefined}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function TeamBuilder() {
  const [team, setTeam] = useState<TeamSlot[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function addToTeam(p: PokemonSummary) {
    if (team.length >= TEAM_SIZE) {
      setError(`Your team is full (max ${TEAM_SIZE} Pokemon).`);
      return;
    }
    if (team.some((slot) => slot.pokemon.name === p.name)) {
      setError(`${p.display_name} is already on your team.`);
      return;
    }
    setError(null);
    try {
      const detail = await getPokemon(p.name);
      setTeam((prev) => [
        ...prev,
        { pokemon: detail, ability: "", item: "", nature: "hardy", evs: { ...EMPTY_EVS }, moves: [], usage: null },
      ]);
      // Best-effort: most Pokemon won't have usage data yet, so a 404 here is expected, not an error.
      getPokemonUsage(p.name)
        .then((usage) => {
          if (usage) {
            setTeam((prev) => prev.map((slot) => (slot.pokemon.name === p.name ? { ...slot, usage } : slot)));
          }
        })
        .catch(() => {});
    } catch {
      setError(`Couldn't load details for ${p.display_name}. Is the backend running?`);
    }
  }

  function removeFromTeam(index: number) {
    setTeam((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSlot(index: number, patch: Partial<TeamSlot>) {
    setTeam((prev) => prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  }

  function updateEv(index: number, statKey: StatKey, value: number) {
    setTeam((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, evs: { ...slot.evs, [statKey]: value } } : slot))
    );
  }

  function updateMove(index: number, moveIndex: number, moveName: string) {
    setTeam((prev) =>
      prev.map((slot, i) => {
        if (i !== index) return slot;
        const moves = [...slot.moves];
        moves[moveIndex] = moveName;
        return { ...slot, moves };
      })
    );
  }

  return (
    <div className="team-builder">
      <h2>Team Builder</h2>
      <p className="subtitle">
        {team.length}/{TEAM_SIZE} Pokemon on your team
      </p>

      {error && <div className="error-banner">{error}</div>}

      <PokemonSearch onPick={addToTeam} />

      <div className="team-grid">
        {team.map((slot, i) => (
          <TeamSlotCard
            key={slot.pokemon.id}
            slot={slot}
            onRemove={() => removeFromTeam(i)}
            onChangeAbility={(a) => updateSlot(i, { ability: a })}
            onChangeItem={(item) => updateSlot(i, { item })}
            onChangeNature={(nature) => updateSlot(i, { nature })}
            onChangeEv={(statKey, v) => updateEv(i, statKey, v)}
            onChangeMove={(mi, m) => updateMove(i, mi, m)}
          />
        ))}
      </div>
    </div>
  );
}
