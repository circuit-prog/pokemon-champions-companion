import { useEffect, useState } from "react";
import { getPokemon } from "../api";
import type { PokemonSummary } from "../api";
import { getTeam, updateTeam } from "../teamStorage";
import type { SavedTeam, TeamSlotData, EvSpread } from "../teamStorage";
import PokemonTable from "./PokemonTable";
import PartnerSuggestions from "./PartnerSuggestions";
import SlotEditor from "./SlotEditor";
import "./TeamEditorPage.css";

const TEAM_SIZE = 6;
const EMPTY_EVS: EvSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export default function TeamEditorPage({ teamId, onBack }: { teamId: string; onBack: () => void }) {
  const [team, setTeam] = useState<SavedTeam | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | "add">(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loaded = getTeam(teamId);
    setTeam(loaded);
    setActiveIndex(loaded && loaded.slots.length > 0 ? 0 : "add");
  }, [teamId]);

  function persist(next: SavedTeam) {
    setTeam(next);
    updateTeam(next);
  }

  async function addPokemon(p: PokemonSummary) {
    if (!team) return;
    if (team.slots.length >= TEAM_SIZE) {
      setError(`Your team is full (max ${TEAM_SIZE} Pokemon).`);
      return;
    }
    if (team.slots.some((s) => s.pokemon.name === p.name)) {
      setError(`${p.display_name} is already on this team.`);
      return;
    }
    setError(null);
    try {
      const detail = await getPokemon(p.name);
      const newSlot: TeamSlotData = {
        pokemon: detail,
        ability: "",
        item: "",
        nature: "hardy",
        evs: { ...EMPTY_EVS },
        moves: [],
        usage: null,
      };
      const next = { ...team, slots: [...team.slots, newSlot] };
      persist(next);
      setActiveIndex(next.slots.length - 1);
    } catch {
      setError(`Couldn't load details for ${p.display_name}. Is the backend running?`);
    }
  }

  function removeSlot(index: number) {
    if (!team) return;
    const next = { ...team, slots: team.slots.filter((_, i) => i !== index) };
    persist(next);
    setActiveIndex(next.slots.length > 0 ? Math.max(0, index - 1) : "add");
  }

  function updateSlot(index: number, patch: Partial<TeamSlotData>) {
    if (!team) return;
    const next = { ...team, slots: team.slots.map((s, i) => (i === index ? { ...s, ...patch } : s)) };
    persist(next);
  }

  function renameTeam(name: string) {
    if (!team) return;
    persist({ ...team, name });
  }

  if (!team) {
    return (
      <div className="team-editor-page">
        <p>Team not found.</p>
        <button onClick={onBack}>Back to Teams</button>
      </div>
    );
  }

  return (
    <div className="team-editor-page">
      <div className="team-editor-topbar">
        <button className="back-btn" onClick={onBack}>
          ← Teams
        </button>
        <input className="team-name-input" value={team.name} onChange={(e) => renameTeam(e.target.value)} />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="team-editor-tabs">
        {team.slots.map((slot, i) => (
          <button
            key={slot.pokemon.id}
            className={activeIndex === i ? "slot-tab active" : "slot-tab"}
            onClick={() => setActiveIndex(i)}
          >
            {slot.pokemon.sprite_url && <img src={slot.pokemon.sprite_url} alt={slot.pokemon.display_name} />}
            <span>{slot.pokemon.display_name}</span>
          </button>
        ))}
        {team.slots.length < TEAM_SIZE && (
          <button className={activeIndex === "add" ? "slot-tab add active" : "slot-tab add"} onClick={() => setActiveIndex("add")}>
            +
          </button>
        )}
      </div>

      {activeIndex === "add" ? (
        <>
          <PartnerSuggestions team={team} onPick={addPokemon} />
          <PokemonTable onPick={addPokemon} />
        </>
      ) : (
        team.slots[activeIndex] && (
          <>
            <button className="remove-slot-btn" onClick={() => removeSlot(activeIndex)}>
              Remove {team.slots[activeIndex].pokemon.display_name} from team
            </button>
            <SlotEditor slot={team.slots[activeIndex]} onChange={(patch) => updateSlot(activeIndex, patch)} />
          </>
        )
      )}
    </div>
  );
}
