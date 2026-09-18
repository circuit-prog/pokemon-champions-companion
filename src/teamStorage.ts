// Saved teams persist in the browser's localStorage - there's no user login
// or backend team storage yet, so this is per-device only (matches how
// Pokemon Showdown's team builder works before you explicitly upload a team).
import type { PokemonDetail, PokemonUsageOut } from "./api";
import type { StatKey } from "./natures";

export type EvSpread = Record<StatKey, number>;

export interface TeamSlotData {
  pokemon: PokemonDetail;
  ability: string;
  item: string;
  nature: string;
  evs: EvSpread;
  moves: string[];
  usage: PokemonUsageOut | null;
}

export interface SavedTeam {
  id: string;
  name: string;
  folder: string; // "" = uncategorized
  slots: TeamSlotData[];
  updatedAt: number;
}

const STORAGE_KEY = "pcc.teams.v1";

export function loadTeams(): SavedTeam[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedTeam[];
  } catch {
    return [];
  }
}

function saveTeams(teams: SavedTeam[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
}

function makeId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createTeam(name = "Untitled Team"): SavedTeam {
  const team: SavedTeam = { id: makeId(), name, folder: "", slots: [], updatedAt: Date.now() };
  const teams = loadTeams();
  teams.push(team);
  saveTeams(teams);
  return team;
}

export function updateTeam(team: SavedTeam): void {
  const teams = loadTeams();
  const idx = teams.findIndex((t) => t.id === team.id);
  const updated = { ...team, updatedAt: Date.now() };
  if (idx === -1) teams.push(updated);
  else teams[idx] = updated;
  saveTeams(teams);
}

export function deleteTeam(id: string): void {
  saveTeams(loadTeams().filter((t) => t.id !== id));
}

export function duplicateTeam(id: string): SavedTeam | null {
  const teams = loadTeams();
  const original = teams.find((t) => t.id === id);
  if (!original) return null;
  const copy: SavedTeam = { ...original, id: makeId(), name: `${original.name} (copy)`, updatedAt: Date.now() };
  teams.push(copy);
  saveTeams(teams);
  return copy;
}

export function getTeam(id: string): SavedTeam | null {
  return loadTeams().find((t) => t.id === id) ?? null;
}

export const TEAM_SIZE = 6;

/** Create a team already populated with slots - used when importing a whole
 *  roster, like a tournament team or a team core. */
export function createTeamWithSlots(name: string, slots: TeamSlotData[]): SavedTeam {
  const team: SavedTeam = { id: makeId(), name, folder: "", slots, updatedAt: Date.now() };
  const teams = loadTeams();
  teams.push(team);
  saveTeams(teams);
  return team;
}

/** All saved teams as a JSON string, for moving them to another device/
 *  browser (localStorage is per-device only - see the module docstring). */
export function exportTeamsJson(): string {
  return JSON.stringify(loadTeams(), null, 2);
}

/** Import teams from a JSON string produced by exportTeamsJson(), merging
 *  into whatever's already saved on this device. Re-importing the same
 *  export twice is safe - teams already present (matched by id) are
 *  skipped rather than duplicated. Throws on malformed input. */
export function importTeamsFromJson(json: string): { imported: number; skipped: number } {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("Expected a JSON array of teams.");
  }
  const existing = loadTeams();
  const existingIds = new Set(existing.map((t) => t.id));
  let imported = 0;
  let skipped = 0;
  const merged = [...existing];
  for (const team of parsed) {
    if (!team || typeof team !== "object" || typeof team.id !== "string" || !Array.isArray(team.slots)) {
      skipped++;
      continue;
    }
    if (existingIds.has(team.id)) {
      skipped++;
      continue;
    }
    merged.push(team as SavedTeam);
    existingIds.add(team.id);
    imported++;
  }
  saveTeams(merged);
  return { imported, skipped };
}

/** Add one Pokemon to an existing team.
 *
 *  Returns a human-readable reason instead of throwing when it can't - the
 *  callers are all "+ Add" buttons scattered around the site that just need
 *  something to show the user. */
export function addSlotToTeam(
  teamId: string,
  slot: TeamSlotData
): { ok: true; team: SavedTeam } | { ok: false; reason: string } {
  const team = getTeam(teamId);
  if (!team) return { ok: false, reason: "That team no longer exists." };
  if (team.slots.length >= TEAM_SIZE) {
    return { ok: false, reason: `${team.name} is already full (${TEAM_SIZE} Pokemon).` };
  }
  if (team.slots.some((s) => s.pokemon.name === slot.pokemon.name)) {
    return { ok: false, reason: `${slot.pokemon.display_name} is already on ${team.name}.` };
  }
  const updated = { ...team, slots: [...team.slots, slot] };
  updateTeam(updated);
  return { ok: true, team: updated };
}
