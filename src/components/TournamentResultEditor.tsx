import { useEffect, useState } from "react";
import { getPokemon } from "../api";
import type { PokemonSummary, TournamentResultIn, TournamentResultOut } from "../api";
import { EMPTY_EVS } from "../setBuilder";
import type { TeamSlotData } from "../teamStorage";
import PokemonTable from "./PokemonTable";
import SlotEditor from "./SlotEditor";
import "./TeamEditorPage.css"; // reuses .slot-tab / .team-editor-tabs / .remove-slot-btn
import "./TournamentsPage.css";

const ROSTER_SIZE = 6;

function slotToRosterEntry(slot: TeamSlotData) {
  return {
    pokemon_name: slot.pokemon.name,
    evs: slot.evs,
    nature: slot.nature,
    ability: slot.ability,
    item: slot.item,
    moves: slot.moves,
  };
}

/** Add/edit one tournament result: placement, player, notes, dark-horse flag,
 *  and a full 6-Pokemon roster with real sets - reuses the exact same
 *  SlotEditor + slot-tabs pattern as TeamEditorPage, just against local state
 *  instead of a saved team, since this roster belongs to someone else's
 *  tournament result, not your own team storage. */
export default function TournamentResultEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: TournamentResultOut | null;
  onSave: (body: TournamentResultIn) => void;
  onCancel: () => void;
}) {
  const [placement, setPlacement] = useState(initial?.placement ?? 1);
  const [player, setPlayer] = useState(initial?.player ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [isDarkHorse, setIsDarkHorse] = useState(initial?.is_dark_horse ?? false);
  const [slots, setSlots] = useState<TeamSlotData[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | "add">("add");
  const [loading, setLoading] = useState(Boolean(initial));
  const [error, setError] = useState<string | null>(null);

  // Editing an existing result: the API only gives us names/slugs, so
  // reconstruct each slot's full PokemonDetail (SlotEditor needs the whole
  // thing, not just a name) before the editor can render it.
  useEffect(() => {
    if (!initial) return;
    let cancelled = false;
    Promise.all(
      initial.roster.map(async (r) => {
        const detail = await getPokemon(r.pokemon_name);
        const slot: TeamSlotData = {
          pokemon: detail,
          ability: r.ability ?? "",
          item: r.item ?? "",
          nature: r.nature,
          evs: { ...EMPTY_EVS, ...r.evs },
          moves: r.moves,
          usage: null,
        };
        return slot;
      })
    )
      .then((built) => {
        if (cancelled) return;
        setSlots(built);
        setActiveIndex(built.length > 0 ? 0 : "add");
      })
      .catch(() => !cancelled && setError("Couldn't load this result's roster. Is the backend running?"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [initial]);

  async function addPokemon(p: PokemonSummary) {
    if (slots.length >= ROSTER_SIZE) {
      setError(`A roster can only have ${ROSTER_SIZE} Pokemon.`);
      return;
    }
    if (slots.some((s) => s.pokemon.name === p.name)) {
      setError(`${p.display_name} is already on this roster.`);
      return;
    }
    setError(null);
    try {
      const detail = await getPokemon(p.name);
      const slot: TeamSlotData = {
        pokemon: detail,
        ability: "",
        item: "",
        nature: "hardy",
        evs: { ...EMPTY_EVS },
        moves: [],
        usage: null,
      };
      const next = [...slots, slot];
      setSlots(next);
      setActiveIndex(next.length - 1);
    } catch {
      setError(`Couldn't load details for ${p.display_name}. Is the backend running?`);
    }
  }

  function removeSlot(index: number) {
    const next = slots.filter((_, i) => i !== index);
    setSlots(next);
    setActiveIndex(next.length > 0 ? Math.max(0, index - 1) : "add");
  }

  function updateSlot(index: number, patch: Partial<TeamSlotData>) {
    setSlots(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function handleSave() {
    if (slots.length === 0) {
      setError("Add at least one Pokemon to this roster.");
      return;
    }
    onSave({
      placement,
      player: player.trim() || null,
      notes: notes.trim() || null,
      is_dark_horse: isDarkHorse,
      roster: slots.map(slotToRosterEntry),
    });
  }

  if (loading) return <p className="subtitle">Loading roster...</p>;

  return (
    <div className="tournament-result-editor">
      {error && <div className="error-banner">{error}</div>}

      <div className="tournament-result-fields">
        <label className="field">
          Placement
          <input type="number" min={1} max={32} value={placement} onChange={(e) => setPlacement(Number(e.target.value))} />
        </label>
        <label className="field">
          Player
          <input type="text" value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="Player name..." />
        </label>
        <label className="field checkbox-field">
          <input type="checkbox" checked={isDarkHorse} onChange={(e) => setIsDarkHorse(e.target.checked)} />
          Dark horse
        </label>
      </div>
      <label className="field">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Why this team placed where it did..." />
      </label>

      <div className="team-editor-tabs">
        {slots.map((slot, i) => (
          <button key={slot.pokemon.id} className={activeIndex === i ? "slot-tab active" : "slot-tab"} onClick={() => setActiveIndex(i)}>
            {slot.pokemon.sprite_url && <img src={slot.pokemon.sprite_url} alt={slot.pokemon.display_name} />}
            <span>{slot.pokemon.display_name}</span>
          </button>
        ))}
        {slots.length < ROSTER_SIZE && (
          <button className={activeIndex === "add" ? "slot-tab add active" : "slot-tab add"} onClick={() => setActiveIndex("add")}>
            +
          </button>
        )}
      </div>

      {activeIndex === "add" ? (
        <PokemonTable onPick={addPokemon} />
      ) : (
        slots[activeIndex] && (
          <>
            <button className="remove-slot-btn" onClick={() => removeSlot(activeIndex)}>
              Remove {slots[activeIndex].pokemon.display_name} from roster
            </button>
            <SlotEditor slot={slots[activeIndex]} onChange={(patch) => updateSlot(activeIndex, patch)} />
          </>
        )
      )}

      <div className="tournament-result-actions">
        <button className="new-team-btn" onClick={handleSave}>
          Save Result
        </button>
        <button className="import-cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
