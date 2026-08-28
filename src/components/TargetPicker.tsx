import { useEffect, useState } from "react";
import { searchPokemon, getPokemon, searchItems, getPokemonUsage } from "../api";
import type { PokemonSummary, PokemonDetail, ItemOut } from "../api";
import { NATURE_NAMES, MAX_EV_PER_STAT, EV_TOTAL_BUDGET, natureDescription, type StatKey } from "../natures";
import { statAtLevel } from "../statCalc";
import "./TargetPicker.css";

export function baseStatOf(p: PokemonDetail, k: StatKey): number {
  switch (k) {
    case "hp": return p.hp;
    case "atk": return p.attack;
    case "def": return p.defense;
    case "spa": return p.special_attack;
    case "spd": return p.special_defense;
    case "spe": return p.speed;
  }
}

export interface TargetSpec {
  pokemon: PokemonDetail;
  nature: string;
  evs: Record<StatKey, number>;
  ability: string;
  item: string;
  // Battle-state fields, only surfaced when `advanced` is on (damage calculator).
  level: number;
  status: string;
  currentHpPercent: number;
  stages: Partial<Record<StatKey, number>>;
}

const STAT_KEYS: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_LABELS: Record<StatKey, string> = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
const EMPTY_EVS: Record<StatKey, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const STATUSES = [
  { value: "healthy", label: "Healthy" },
  { value: "burn", label: "Burned (halves physical Atk)" },
  { value: "paralysis", label: "Paralyzed" },
  { value: "poison", label: "Poisoned" },
  { value: "badly-poisoned", label: "Badly Poisoned" },
  { value: "sleep", label: "Asleep" },
  { value: "freeze", label: "Frozen" },
];

// -6 through +6 stat stages, as shown in competitive calculators.
const STAGE_OPTIONS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6];

export function defaultTargetSpec(pokemon: PokemonDetail, ability = "", item = ""): TargetSpec {
  return {
    pokemon,
    nature: "hardy",
    evs: { ...EMPTY_EVS },
    ability,
    item,
    level: 50,
    status: "healthy",
    currentHpPercent: 100,
    stages: {},
  };
}

function MiniItemSearch({ onPick }: { onPick: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemOut[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (!query) return setResults([]);
      searchItems(query).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="target-item-search">
      <input
        type="text"
        placeholder="Item (optional)..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open && results.length > 0 && (
        <div className="target-item-results">
          {results.map((it) => (
            <button
              key={it.id}
              onClick={() => {
                onPick(it.name);
                setQuery(it.display_name);
                setOpen(false);
              }}
            >
              {it.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TargetPicker({
  label,
  target,
  onChange,
  advanced = false,
}: {
  label: string;
  target: TargetSpec | null;
  onChange: (t: TargetSpec) => void;
  /** Show battle-state controls (level, status, current HP, stat stages). */
  advanced?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PokemonSummary[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!searchOpen) return;
    const handle = setTimeout(() => {
      if (!query) return setResults([]);
      searchPokemon(query).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, searchOpen]);

  async function pick(p: PokemonSummary) {
    const detail = await getPokemon(p.name);
    let ability = "";
    let item = "";

    // Auto-fill the most-used real ability/item for this Pokemon, if we have
    // tracked usage data for it. EV spreads aren't in the scraped data, so
    // those stay at 0 for the user to fill in manually.
    try {
      const usage = await getPokemonUsage(p.name);
      const topAbilityName = usage?.abilities[0]?.name.toLowerCase();
      if (topAbilityName) {
        const match = detail.abilities.find((a) => a.display_name.toLowerCase() === topAbilityName);
        if (match) ability = match.name;
      }
      const topItemName = usage?.items[0]?.name;
      if (topItemName) {
        const itemMatches = await searchItems(topItemName);
        const match = itemMatches.find((i) => i.display_name.toLowerCase() === topItemName.toLowerCase());
        if (match) item = match.name;
      }
    } catch {
      // no usage data for this Pokemon - leave ability/item blank for manual entry
    }

    onChange(defaultTargetSpec(detail, ability, item));
    setQuery(p.display_name);
    setResults([]);
    setSearchOpen(false);
  }

  return (
    <div className="target-picker">
      <label className="field">
        {label}
        <input
          type="text"
          placeholder="Search Pokemon..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
        />
      </label>
      {searchOpen && results.length > 0 && (
        <div className="target-search-results">
          {results.map((p) => (
            <button key={p.id} onClick={() => pick(p)}>
              {p.sprite_url && <img src={p.sprite_url} alt="" />}
              {p.display_name}
            </button>
          ))}
        </div>
      )}

      {target && (
        <div className="target-details">
          <div className="target-details-header">
            {target.pokemon.sprite_url && <img src={target.pokemon.sprite_url} alt="" />}
            <strong>{target.pokemon.display_name}</strong>
          </div>

          <label className="field">
            Ability
            <select value={target.ability} onChange={(e) => onChange({ ...target, ability: e.target.value })}>
              <option value="">-- none --</option>
              {target.pokemon.abilities.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.display_name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Item
            <MiniItemSearch onPick={(item) => onChange({ ...target, item })} />
          </label>

          <label className="field">
            Nature
            <select value={target.nature} onChange={(e) => onChange({ ...target, nature: e.target.value })}>
              {NATURE_NAMES.map((n) => (
                <option key={n} value={n}>
                  {n[0].toUpperCase() + n.slice(1)} — {natureDescription(n)}
                </option>
              ))}
            </select>
            <span className="nature-effect">{natureDescription(target.nature)}</span>
          </label>

          {advanced ? (
            <>
              <div className="target-battle-state">
                <label className="field">
                  Level
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={target.level}
                    onChange={(e) =>
                      onChange({ ...target, level: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })
                    }
                  />
                </label>
                <label className="field">
                  Status
                  <select value={target.status} onChange={(e) => onChange({ ...target, status: e.target.value })}>
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Current HP %
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={target.currentHpPercent}
                    onChange={(e) =>
                      onChange({
                        ...target,
                        currentHpPercent: Math.max(1, Math.min(100, Number(e.target.value) || 1)),
                      })
                    }
                  />
                </label>
              </div>

              <table className="stat-table">
                <thead>
                  <tr>
                    <th />
                    <th>Base</th>
                    <th>EV</th>
                    <th>Stat</th>
                    <th>Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {STAT_KEYS.map((k) => {
                    const evTotal = STAT_KEYS.reduce((sum, sk) => sum + target.evs[sk], 0);
                    const maxAllowed = Math.min(MAX_EV_PER_STAT, EV_TOTAL_BUDGET - (evTotal - target.evs[k]));
                    const base = baseStatOf(target.pokemon, k);
                    const final = statAtLevel(base, target.evs[k], target.level, k, target.nature);
                    return (
                      <tr key={k}>
                        <td className="stat-table-label">{STAT_LABELS[k]}</td>
                        <td className="stat-table-base">{base}</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={maxAllowed}
                            value={target.evs[k]}
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(maxAllowed, Number(e.target.value) || 0));
                              onChange({ ...target, evs: { ...target.evs, [k]: v } });
                            }}
                          />
                        </td>
                        <td className="stat-table-final">{final}</td>
                        <td>
                          {k === "hp" ? (
                            <span className="stat-table-na">—</span>
                          ) : (
                            <select
                              value={target.stages[k] ?? 0}
                              onChange={(e) =>
                                onChange({ ...target, stages: { ...target.stages, [k]: Number(e.target.value) } })
                              }
                            >
                              {STAGE_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s > 0 ? `+${s}` : s}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="ev-total">
                EV total: {STAT_KEYS.reduce((sum, k) => sum + target.evs[k], 0)}/{EV_TOTAL_BUDGET}
              </div>
            </>
          ) : (
            <>
              <div className="target-evs">
                {STAT_KEYS.map((k) => {
                  const evTotal = STAT_KEYS.reduce((sum, sk) => sum + target.evs[sk], 0);
                  const maxAllowed = Math.min(MAX_EV_PER_STAT, EV_TOTAL_BUDGET - (evTotal - target.evs[k]));
                  return (
                    <label key={k} className="target-ev-field">
                      {STAT_LABELS[k]}
                      <input
                        type="number"
                        min={0}
                        max={maxAllowed}
                        value={target.evs[k]}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(maxAllowed, Number(e.target.value) || 0));
                          onChange({ ...target, evs: { ...target.evs, [k]: v } });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
              <div className="ev-total">
                EV total: {STAT_KEYS.reduce((sum, k) => sum + target.evs[k], 0)}/{EV_TOTAL_BUDGET}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
