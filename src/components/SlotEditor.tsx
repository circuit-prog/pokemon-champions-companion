import { useEffect, useState } from "react";
import { searchItems, getPokemonUsage } from "../api";
import type { ItemOut, PokemonUsageOut } from "../api";
import { NATURE_NAMES, MAX_EV_PER_STAT, EV_TOTAL_BUDGET, natureDescription, type StatKey } from "../natures";
import { statAtLevel } from "../statCalc";
import type { TeamSlotData } from "../teamStorage";
import MovePicker from "./MovePicker";
import AbilityPicker from "./AbilityPicker";
import "./TeamBuilder.css";

const STAT_KEYS: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_LABELS: Record<StatKey, string> = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };

function ItemSearch({ onPick }: { onPick: (itemName: string, effect: string | null) => void }) {
  const [query, setQuery] = useState("");
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
              onClick={() => {
                onPick(item.name, item.effect);
                setQuery(item.display_name);
                setOpen(false);
              }}
            >
              <div className="item-result-row">
                {item.sprite_url && <img src={item.sprite_url} alt="" />}
                <span className="item-result-name">{item.display_name}</span>
              </div>
              {item.effect && <div className="item-result-desc">{item.effect}</div>}
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
  maxAllowed,
  onChangeEv,
}: {
  statKey: StatKey;
  base: number;
  ev: number;
  nature: string;
  maxAllowed: number;
  onChangeEv: (value: number) => void;
}) {
  const final = statAtLevel(base, ev, 50, statKey, nature);
  return (
    <div className="stat-row">
      <span className="stat-label">{STAT_LABELS[statKey]}</span>
      <input
        type="number"
        min={0}
        max={maxAllowed}
        value={ev}
        onChange={(e) => {
          const clamped = Math.max(0, Math.min(maxAllowed, Number(e.target.value) || 0));
          onChangeEv(clamped);
        }}
      />
      <span className="stat-final">{final}</span>
    </div>
  );
}

function UsageSection({ label, entries }: { label: string; entries: PokemonUsageOut["moves"] | undefined }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="usage-section">
      <span className="usage-col-label">{label}</span>
      {entries.map((m) => (
        <div key={m.name} className="usage-entry">
          <span className="usage-entry-name">{m.name}</span>
          <span className="usage-entry-pct">{m.percent != null ? `${m.percent}%` : ""}</span>
        </div>
      ))}
    </div>
  );
}

function UsagePanel({ usage }: { usage: PokemonUsageOut | null }) {
  if (!usage) {
    return <div className="usage-panel usage-panel-empty">No tracked competitive usage data yet.</div>;
  }
  return (
    <div className="usage-panel">
      <div className="usage-header">
        Meta usage: #{usage.rank}
        {usage.win_rate != null ? ` · ${usage.win_rate}% win rate` : ""}
        {usage.record ? ` (${usage.record})` : ""}
      </div>
      <UsageSection label="Moves" entries={usage.moves} />
      <UsageSection label="Items" entries={usage.items} />
      <UsageSection label="Abilities" entries={usage.abilities} />
      <UsageSection label="Common Teammates" entries={usage.teammates} />
    </div>
  );
}

export default function SlotEditor({
  slot,
  onChange,
}: {
  slot: TeamSlotData;
  onChange: (patch: Partial<TeamSlotData>) => void;
}) {
  const { pokemon } = slot;
  const evTotal = STAT_KEYS.reduce((sum, k) => sum + slot.evs[k], 0);

  // Best-effort usage fetch: most Pokemon won't have tracked usage data yet.
  useEffect(() => {
    if (slot.usage !== null) return;
    let cancelled = false;
    getPokemonUsage(pokemon.name)
      .then((usage) => {
        if (!cancelled && usage) onChange({ usage });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pokemon.name]);

  function toggleMove(moveName: string) {
    if (slot.moves.includes(moveName)) {
      onChange({ moves: slot.moves.filter((m) => m !== moveName) });
    } else if (slot.moves.length < 4) {
      onChange({ moves: [...slot.moves, moveName] });
    }
  }

  return (
    <div className="slot-editor">
      <div className="slot-editor-header">
        {pokemon.sprite_url && <img src={pokemon.sprite_url} alt={pokemon.display_name} />}
        <div>
          <h3>{pokemon.display_name}</h3>
          <span className="types">
            {pokemon.type1}
            {pokemon.type2 ? ` / ${pokemon.type2}` : ""}
          </span>
        </div>
      </div>

      <UsagePanel usage={slot.usage} />

      <div className="slot-editor-columns">
        <div className="slot-editor-col">
          <label className="field">
            Item
            <ItemSearch onPick={(item) => onChange({ item })} />
          </label>

          <AbilityPicker abilities={pokemon.abilities} selected={slot.ability} onSelect={(a) => onChange({ ability: a })} />

          <label className="field">
            Nature
            <select value={slot.nature} onChange={(e) => onChange({ nature: e.target.value })}>
              {NATURE_NAMES.map((n) => (
                <option key={n} value={n}>
                  {n[0].toUpperCase() + n.slice(1)} — {natureDescription(n)}
                </option>
              ))}
            </select>
            <span className="nature-effect">{natureDescription(slot.nature)}</span>
          </label>

          <div className="stats">
            <div className="stats-header">
              <span />
              <span>EV (0-{MAX_EV_PER_STAT})</span>
              <span>Stat</span>
            </div>
            {STAT_KEYS.map((k) => {
              const restBudgetUsed = evTotal - slot.evs[k];
              const maxAllowed = Math.min(MAX_EV_PER_STAT, EV_TOTAL_BUDGET - restBudgetUsed);
              return (
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
                  maxAllowed={maxAllowed}
                  onChangeEv={(v) => onChange({ evs: { ...slot.evs, [k]: v } })}
                />
              );
            })}
            <div className="ev-total">
              EV total: {evTotal}/{EV_TOTAL_BUDGET}
            </div>
          </div>
        </div>

        <div className="slot-editor-col">
          <MovePicker moves={pokemon.moves} usage={slot.usage} selected={slot.moves} onToggle={toggleMove} />
        </div>
      </div>
    </div>
  );
}
