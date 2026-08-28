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
  hp: number;
  attack: number;
  defense: number;
  special_attack: number;
  special_defense: number;
  speed: number;
  abilities: string[];
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
  effect: string | null;
}

export interface AbilityOut {
  id: number;
  name: string;
  display_name: string;
  effect: string | null;
}

export interface ItemOut {
  id: number;
  name: string;
  display_name: string;
  sprite_url: string | null;
  effect: string | null;
}

export interface PokemonDetail extends Omit<PokemonSummary, "abilities"> {
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
  status?: string;
  current_hp_percent?: number;
  type_override?: string[] | null;
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
  defender_current_hp?: number | null;
  /** The 16 possible damage values the game rolls between. */
  rolls?: number[] | null;
  ko_text?: string | null;
  ko_chance_percent?: number | null;
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

export function searchItems(query: string): Promise<ItemOut[]> {
  const params = query ? `?search=${encodeURIComponent(query)}` : "";
  return getJson<ItemOut[]>(`/api/items${params}`);
}

export interface UsageEntry {
  name: string;
  percent: number | null;
}

export interface PokemonUsageOut {
  format: string;
  rank: number;
  usage_percent: number | null;
  win_rate: number | null;
  record: string | null;
  moves: UsageEntry[];
  items: UsageEntry[];
  abilities: UsageEntry[];
  teammates: UsageEntry[];
}

// Returns null (not an error) when the Pokemon has no tracked competitive
// usage data yet — most of the roster won't, since the Champions meta is
// still small (only ~83 Pokemon tracked as of writing).
export async function getPokemonUsage(name: string): Promise<PokemonUsageOut | null> {
  const res = await fetch(`${API_BASE}/api/pokemon/${encodeURIComponent(name)}/usage`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Request for usage of ${name} failed: ${res.status}`);
  return res.json() as Promise<PokemonUsageOut>;
}

export interface MetaRankingEntry {
  rank: number;
  name: string;
  display_name: string;
  sprite_url: string | null;
  type1: string;
  type2: string | null;
  usage_percent: number | null;
  win_rate: number | null;
}

export function getMetaRankings(): Promise<MetaRankingEntry[]> {
  return getJson<MetaRankingEntry[]>("/api/meta/rankings");
}

export function calcDamage(
  attacker: CombatantIn,
  defender: CombatantIn,
  moveName: string,
  field: object = {}
): Promise<DamageCalcResult> {
  return postJson<DamageCalcResult>("/api/calc/damage", {
    attacker,
    defender,
    move_name: moveName,
    field,
  });
}

export interface SurvivalResult {
  found: boolean;
  reason?: string | null;
  hp_ev?: number | null;
  def_ev?: number | null;
  def_stat_key?: string | null;
  total_evs?: number | null;
  worst_case_damage?: number | null;
  worst_case_percent?: number | null;
  resulting_hp?: number | null;
}

/** Solve for the cheapest EV spread that survives `moveName` with at least
 *  `surviveAtHpPercent` of max HP remaining. */
export function calcSurvival(
  attacker: CombatantIn,
  defender: CombatantIn,
  moveName: string,
  surviveAtHpPercent: number,
  field: object = {}
): Promise<SurvivalResult> {
  return postJson<SurvivalResult>("/api/calc/survive", {
    attacker,
    defender,
    move_name: moveName,
    field,
    survive_at_hp_percent: surviveAtHpPercent,
  });
}
