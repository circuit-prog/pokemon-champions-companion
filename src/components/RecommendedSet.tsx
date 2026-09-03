import { useEffect, useState } from "react";
import { buildSlot } from "../setBuilder";
import type { TeamSlotData } from "../teamStorage";
import type { StatKey } from "../natures";
import AddToTeam from "./AddToTeam";
import "./RecommendedSet.css";

const ALL_STAT_KEYS: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_LABELS: Record<StatKey, string> = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

/** "One button gives a complete competitive set" - the recommended-set
 *  generator the audit asked for. `buildSlot` already assembles this (it's
 *  what "+ Add to team" silently applies); this just makes the result
 *  visible on its own, before you commit to adding the Pokemon anywhere. */
export default function RecommendedSet({ pokemonName }: { pokemonName: string }) {
  const [slot, setSlot] = useState<TeamSlotData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSlot(null);
    setError(null);
    buildSlot(pokemonName)
      .then((s) => !cancelled && setSlot(s))
      .catch(() => !cancelled && setError("Couldn't build a recommended set. Is the backend running?"));
    return () => {
      cancelled = true;
    };
  }, [pokemonName]);

  if (error) return null;
  if (!slot) return <p className="subtitle">Building a recommended set...</p>;
  if (!slot.usage) {
    return (
      <p className="subtitle">No tracked usage data for this Pokemon yet, so there's no real set to recommend.</p>
    );
  }

  const moveNames = slot.moves
    .map((m) => slot.pokemon.moves.find((pm) => pm.name === m)?.display_name ?? titleCase(m))
    .filter(Boolean);
  const abilityName = slot.pokemon.abilities.find((a) => a.name === slot.ability)?.display_name ?? titleCase(slot.ability);
  const evTotal = ALL_STAT_KEYS.reduce((sum, k) => sum + slot.evs[k], 0);

  return (
    <div className="recommended-set">
      <h3>Recommended Set</h3>
      <p className="recommended-set-note">This Pokemon's most-used real set, in one place.</p>
      <div className="recommended-set-card">
        <div className="recommended-set-row">
          <span className="recommended-set-label">Ability</span>
          <span>{abilityName}</span>
        </div>
        {slot.item && (
          <div className="recommended-set-row">
            <span className="recommended-set-label">Item</span>
            <span>{titleCase(slot.item)}</span>
          </div>
        )}
        <div className="recommended-set-row">
          <span className="recommended-set-label">Nature</span>
          <span>{titleCase(slot.nature)}</span>
        </div>
        <div className="recommended-set-row">
          <span className="recommended-set-label">EVs</span>
          <span>
            {ALL_STAT_KEYS.filter((k) => slot.evs[k] > 0)
              .map((k) => `${slot.evs[k]} ${STAT_LABELS[k]}`)
              .join(" / ") || "None"}{" "}
            ({evTotal}/66)
          </span>
        </div>
        {moveNames.length > 0 && (
          <div className="recommended-set-row">
            <span className="recommended-set-label">Moves</span>
            <span>{moveNames.join(", ")}</span>
          </div>
        )}
        <div className="recommended-set-add">
          <AddToTeam pokemonName={pokemonName} label="+ Add this set to a team" compact />
        </div>
      </div>
    </div>
  );
}
