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
