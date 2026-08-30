import { useEffect, useRef, useState } from "react";
import { buildSlot, buildSlots } from "../setBuilder";
import { loadTeams, addSlotToTeam, createTeamWithSlots, TEAM_SIZE } from "../teamStorage";
import type { SavedTeam } from "../teamStorage";
import "./AddToTeam.css";

/** "+ Add to team" - the control that turns research into a team.
 *
 * Used anywhere you can see a Pokemon outside the team editor: the Pokedex
 * table, a Pokemon's own page, the Checks & Counters list, Move IQ's
 * suggestions. Picking a team applies that Pokemon's most-used set, so one
 * click gets you a Pokemon that's actually ready to battle with.
 *
 * Pass `roster` instead of `pokemonName` to import a whole team at once
 * (a tournament team, or a team core) into a brand new team.
 */
export default function AddToTeam({
  pokemonName,
  roster,
  rosterName,
  label = "+ Add to team",
  compact = false,
}: {
  /** Single Pokemon slug to add to a chosen team. */
  pokemonName?: string;
  /** A whole roster of slugs to import as a new team. Nulls are skipped. */
  roster?: (string | null)[];
  /** Name to give the team created from `roster`. */
  rosterName?: string;
  label?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const isRoster = Array.isArray(roster);

  // Close when clicking anywhere outside the control.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Messages are confirmations, not permanent state - clear them so the
  // control returns to its normal label.
  useEffect(() => {
    if (!message) return;
    const handle = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(handle);
  }, [message]);

  async function importRoster() {
    setBusy(true);
    try {
      const names = (roster ?? []).filter((n): n is string => Boolean(n));
      const missing = (roster ?? []).length - names.length;
      const { slots, skipped } = await buildSlots(names.slice(0, TEAM_SIZE));
      if (slots.length === 0) {
        setMessage("None of these Pokemon are in our dex yet.");
        return;
      }
      createTeamWithSlots(rosterName || "Imported Team", slots);
      const dropped = missing + skipped.length;
      setMessage(
        dropped > 0
          ? `Created a team with ${slots.length} Pokemon. ${dropped} couldn't be matched to our dex.`
          : `Created a team with all ${slots.length} Pokemon, sets included.`
      );
    } catch {
      setMessage("Couldn't build that team. Is the backend running?");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function addToExisting(team: SavedTeam) {
    if (!pokemonName) return;
    setBusy(true);
    setOpen(false);
    try {
      const slot = await buildSlot(pokemonName);
      const result = addSlotToTeam(team.id, slot);
      setMessage(result.ok ? `Added to ${team.name}, with its most-used set.` : result.reason);
    } catch {
      setMessage("Couldn't add that Pokemon. Is the backend running?");
    } finally {
      setBusy(false);
    }
  }

  async function addToNewTeam() {
    if (!pokemonName) return;
    setBusy(true);
    setOpen(false);
    try {
      const slot = await buildSlot(pokemonName);
      const team = createTeamWithSlots(`${slot.pokemon.display_name} team`, [slot]);
      setMessage(`Started "${team.name}" with its most-used set.`);
    } catch {
      setMessage("Couldn't add that Pokemon. Is the backend running?");
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    if (isRoster) {
      void importRoster();
      return;
    }
    setTeams(loadTeams());
    setOpen((o) => !o);
  }

  return (
    <div className={compact ? "add-to-team compact" : "add-to-team"} ref={wrapRef}>
      <button
        type="button"
        className="add-to-team-btn"
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        disabled={busy}
      >
        {busy ? "Working..." : label}
      </button>

      {open && !isRoster && (
        <div className="add-to-team-menu">
          <span className="add-to-team-menu-label">Add to</span>
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void addToExisting(t);
              }}
            >
              {t.name} <span className="add-to-team-count">{t.slots.length}/{TEAM_SIZE}</span>
            </button>
          ))}
          <button
            type="button"
            className="add-to-team-new"
            onClick={(e) => {
              e.stopPropagation();
              void addToNewTeam();
            }}
          >
            + New team
          </button>
        </div>
      )}

      {message && <div className="add-to-team-message">{message}</div>}
    </div>
  );
}
