// Thin wrapper around fetch() calls to our FastAPI backend.
// Centralizing the base URL here means we only change it in one place
// when we move from local dev to a deployed backend.
const API_BASE = "http://127.0.0.1:8000";

export interface PokemonSummary {
  id: number;
  name: string;
  display_name: string;
  type1: string;
  type2: string | null;
  sprite_url: string | null;
}

export interface MoveOut {
  id: number;
  name: string;
  display_name: string;
  type: string;
  category: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
}

export interface AbilityOut {
  id: number;
  name: string;
  display_name: string;
  effect: string | null;
}

export interface PokemonDetail extends PokemonSummary {
  hp: number;
  attack: number;
  defense: number;
  special_attack: number;
  special_defense: number;
  speed: number;
  moves: MoveOut[];
  abilities: AbilityOut[];
}

export interface CombatantIn {
  pokemon_name: string;
  evs: Record<string, number>;
  nature: string;
  ability?: string;
  item?: string;
  level: number;
  stages?: Record<string, number>;
}

export interface DamageCalcResult {
  error?: string | null;
  immune?: boolean | null;
  reason?: string | null;
  dmg_low?: number | null;
  dmg_high?: number | null;
  pct_low?: number | null;
  pct_high?: number | null;
  defender_hp?: number | null;
  ko_text?: string | null;
  type_effectiveness?: number | null;
  stab?: number | null;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function searchPokemon(query: string): Promise<PokemonSummary[]> {
  const params = query ? `?search=${encodeURIComponent(query)}` : "";
  return getJson<PokemonSummary[]>(`/api/pokemon${params}`);
}

export function getPokemon(name: string): Promise<PokemonDetail> {
  return getJson<PokemonDetail>(`/api/pokemon/${encodeURIComponent(name)}`);
}

export function calcDamage(
  attacker: CombatantIn,
  defender: CombatantIn,
  moveName: string,
  field: Record<string, unknown> = {}
): Promise<DamageCalcResult> {
  return postJson<DamageCalcResult>("/api/calc/damage", {
    attacker,
    defender,
    move_name: moveName,
    field,
  });
}
