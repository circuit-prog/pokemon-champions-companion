import { useEffect, useState } from "react";
import { searchItems, getPokemonUsage } from "../api";
import type { ItemOut, PokemonUsageOut } from "../api";
import { resolveTopSet } from "../setBuilder";
import { NATURE_NAMES, MAX_EV_PER_STAT, EV_TOTAL_BUDGET, natureDescription, type StatKey } from "../natures";
import { statAtLevel } from "../statCalc";
import type { TeamSlotData } from "../teamStorage";
import MovePicker from "./MovePicker";
import AbilityPicker from "./AbilityPicker";
import "./TeamBuilder.css";

const STAT_KEYS: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_LABELS: Record<StatKey, string> = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };

/** Held-item picker.
 *
 * `selected` is the item slug currently saved on the slot. The component is
 * driven by it rather than keeping its own private "what did I pick" state -
 * previously it didn't take the slug at all, so an equipped item never showed
 * up in the box and switching team slots left the previous slot's text behind,
 * which made picking an item look like it had silently failed. */
function ItemSearch({ selected, onPick }: { selected: string; onPick: (itemName: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemOut[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ItemOut | null>(null);

  // Resolve the saved slug to a real item so we can show its name + sprite.
  useEffect(() => {
    if (!selected) {
      setSelectedItem(null);
      return;
    }
    if (selectedItem?.name === selected) return;
    let cancelled = false;
    searchItems(selected.replace(/-/g, " "))
      .then((items) => {
        if (cancelled) return;
        setSelectedItem(items.find((i) => i.name === selected) ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selected, selectedItem]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      searchItems(query.trim()).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function pick(item: ItemOut) {
    setSelectedItem(item);
    onPick(item.name);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="item-search" onBlur={(e) => {
      // Close only when focus leaves the picker entirely, so clicking a result
      // doesn't dismiss the list before the click registers.
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
    }}>
      {selectedItem && (
        <div className="item-selected">
          {selectedItem.sprite_url && <img src={selectedItem.sprite_url} alt="" />}
          <span>{selectedItem.display_name}</span>
          <button
            type="button"
            className="item-clear"
            title="Remove held item"
            onClick={() => {
              setSelectedItem(null);
              onPick("");
            }}
          >
            ×
          </button>
        </div>
      )}
      <input
        type="text"
        placeholder={selectedItem ? "Change item..." : "Search held item..."}
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
              type="button"
              // mouse-down fires before the input's blur, so the pick always lands
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
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

/** One usage list (moves, items, abilities, teammates).
 *
 * Every entry is a button: clicking "Assault Vest 62%" equips Assault Vest,
 * clicking a common teammate adds that Pokemon to the team. Reading a
 * statistic and then having to go and apply it by hand was the single biggest
 * source of friction in the builder. Entries fall back to plain rows only
 * when there's genuinely nothing to apply. */
function UsageSection({
  label,
  entries,
  onApply,
  isActive,
  hint,
  activeHint = "already on this set",
}: {
  label: string;
  entries: PokemonUsageOut["moves"] | undefined;
  onApply?: (entryName: string) => void;
  isActive?: (entryName: string) => boolean;
  hint?: string;
  /** Tooltip suffix when an entry is already applied. */
  activeHint?: string;
}) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="usage-section">
      <span className="usage-col-label">{label}</span>
      {entries.map((m) => {
        const active = isActive?.(m.name) ?? false;
        const pct = m.percent != null ? `${m.percent}%` : "";
        if (!onApply) {
          return (
            <div key={m.name} className="usage-entry">
              <span className="usage-entry-name">{m.name}</span>
              <span className="usage-entry-pct">{pct}</span>
            </div>
          );
        }
        return (
          <button
            key={m.name}
            type="button"
            className={active ? "usage-entry usage-entry-clickable active" : "usage-entry usage-entry-clickable"}
            title={active ? `${m.name} is ${activeHint}` : hint}
            onClick={() => onApply(m.name)}
          >
            <span className="usage-entry-name">{m.name}</span>
            <span className="usage-entry-pct">{pct}</span>
            <span className="usage-entry-mark">{active ? "✓" : "+"}</span>
          </button>
        );
      })}
    </div>
  );
}

function UsagePanel({
  usage,
  slot,
  onChange,
  onAddTeammate,
  onTeamHas,
}: {
  usage: PokemonUsageOut | null;
  slot: TeamSlotData;
  onChange: (patch: Partial<TeamSlotData>) => void;
  /** Add a suggested teammate to the team this slot belongs to. */
  onAddTeammate?: (slug: string, displayName: string) => void;
  /** Whether the team already contains a given Pokemon slug. */
  onTeamHas?: (slug: string) => boolean;
}) {
  const [applying, setApplying] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!usage) {
    return <div className="usage-panel usage-panel-empty">No tracked competitive usage data yet.</div>;
  }

  const { pokemon } = slot;

  function moveSlug(displayName: string): string | null {
    return pokemon.moves.find((m) => m.display_name.toLowerCase() === displayName.toLowerCase())?.name ?? null;
  }

  function abilitySlug(displayName: string): string | null {
    return pokemon.abilities.find((a) => a.display_name.toLowerCase() === displayName.toLowerCase())?.name ?? null;
  }

  function toggleMove(displayName: string) {
    const slug = moveSlug(displayName);
    if (!slug) return setNote(`${displayName} isn't in our move data for ${pokemon.display_name}.`);
    setNote(null);
    if (slot.moves.includes(slug)) {
      onChange({ moves: slot.moves.filter((m) => m !== slug) });
    } else if (slot.moves.length >= 4) {
      setNote("You already have four moves - remove one first.");
    } else {
      onChange({ moves: [...slot.moves, slug] });
    }
  }

  function applyAbility(displayName: string) {
    const slug = abilitySlug(displayName);
    if (!slug) return setNote(`${pokemon.display_name} can't have ${displayName} in our data.`);
    setNote(null);
    onChange({ ability: slug });
  }

  async function applyItem(displayName: string) {
    setNote(null);
    const matches = await searchItems(displayName).catch(() => []);
    const exact = matches.find((i) => i.display_name.toLowerCase() === displayName.toLowerCase());
    if (!exact) return setNote(`We don't have an item called ${displayName}.`);
    onChange({ item: exact.name });
  }

  /** Fill item, ability and the top four moves in one go. */
  async function applyWholeSet() {
    setApplying(true);
    setNote(null);
    try {
      const top = await resolveTopSet(pokemon, usage);
      onChange({ item: top.item, ability: top.ability, moves: top.moves });
      setNote("Applied the most-used item, ability and moves. Nature and EVs aren't published in the usage data, so those are left for you.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="usage-panel">
      <div className="usage-header">
        <span>
          Meta usage: #{usage.rank}
          {usage.win_rate != null ? ` · ${usage.win_rate.toFixed(1)}% win rate` : ""}
          {usage.record ? ` (${usage.record})` : ""}
        </span>
        <button type="button" className="apply-set-btn" onClick={applyWholeSet} disabled={applying}>
          {applying ? "Applying..." : "Use most-used set"}
        </button>
      </div>

      <p className="usage-hint">Click any entry below to put it on this Pokemon.</p>
      {note && <div className="usage-note">{note}</div>}

      <UsageSection
        label="Moves"
        entries={usage.moves}
        onApply={toggleMove}
        isActive={(n) => {
          const slug = moveSlug(n);
          return slug !== null && slot.moves.includes(slug);
        }}
        hint="Click to add or remove this move"
      />
      <UsageSection
        label="Items"
        entries={usage.items}
        onApply={applyItem}
        isActive={(n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-") === slot.item}
        hint="Click to equip this item"
      />
      <UsageSection
        label="Abilities"
        entries={usage.abilities}
        onApply={applyAbility}
        isActive={(n) => abilitySlug(n) === slot.ability}
        hint="Click to set this ability"
      />
      {/* Teammates add a whole Pokemon to the team rather than changing this
          slot, so they're handled by the team, not the slot editor. */}
      <UsageSection
        label="Common Teammates"
        entries={usage.teammates}
        onApply={
          onAddTeammate
            ? (name) => {
                const entry = usage.teammates.find((t) => t.name === name);
                if (!entry?.slug) {
                  setNote(`${name} isn't in our dex, so it can't be added.`);
                  return;
                }
                setNote(null);
                onAddTeammate(entry.slug, name);
              }
            : undefined
        }
        isActive={(name) => {
          const entry = usage.teammates.find((t) => t.name === name);
          return Boolean(entry?.slug && onTeamHas?.(entry.slug));
        }}
        hint="Click to add this Pokemon to your team"
        activeHint="already on your team"
      />
    </div>
  );
}

export default function SlotEditor({
  slot,
  onChange,
  onAddTeammate,
  onTeamHas,
}: {
  slot: TeamSlotData;
  onChange: (patch: Partial<TeamSlotData>) => void;
  onAddTeammate?: (slug: string, displayName: string) => void;
  onTeamHas?: (slug: string) => boolean;
}) {
  const { pokemon } = slot;
  const evTotal = STAT_KEYS.reduce((sum, k) => sum + slot.evs[k], 0);

  // Best-effort usage fetch: most Pokemon won't have tracked usage data yet.
  //
  // Teams are saved to localStorage with their usage data embedded, so a team
  // built before we started returning teammate slugs still holds the old
  // shape - and without a slug a teammate can't be added to the team. Treat
  // that as stale and re-fetch, rather than leaving old teams broken.
  const usageIsStale =
    slot.usage !== null &&
    slot.usage.teammates.length > 0 &&
    slot.usage.teammates.every((t) => t.slug === undefined);

  useEffect(() => {
    if (slot.usage !== null && !usageIsStale) return;
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
  }, [pokemon.name, usageIsStale]);

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

      <UsagePanel
        usage={slot.usage}
        slot={slot}
        onChange={onChange}
        onAddTeammate={onAddTeammate}
        onTeamHas={onTeamHas}
      />

      <div className="slot-editor-columns">
        <div className="slot-editor-col">
          {/* Deliberately a div, not a <label>: a label forwards clicks on its
              contents to the wrapped <input>, which stole clicks aimed at the
              search-result buttons. */}
          <div className="field">
            <span className="field-label">Item</span>
            <ItemSearch selected={slot.item ?? ""} onPick={(item) => onChange({ item })} />
          </div>

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
