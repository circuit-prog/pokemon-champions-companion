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

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function deleteJson(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status}`);
  }
}

export function searchPokemon(query: string): Promise<PokemonSummary[]> {
  const params = query ? `?search=${encodeURIComponent(query)}` : "";
  return getJson<PokemonSummary[]>(`/api/pokemon${params}`);
}

export interface PokemonPage {
  items: PokemonSummary[];
  /** How many Pokemon match in total, regardless of this page's size. */
  total: number;
}

export interface BrowseOptions {
  search?: string;
  /** usage | name | hp | attack | defense | special_attack | special_defense | speed | bst */
  sort?: string;
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  /** Match Pokemon with ANY of these types. */
  types?: string[];
  /** Substring match against ability display names, e.g. "levitate". */
  ability?: string;
  minStats?: Partial<Record<"hp" | "attack" | "defense" | "special_attack" | "special_defense" | "speed", number>>;
  maxStats?: Partial<Record<"hp" | "attack" | "defense" | "special_attack" | "special_defense" | "speed", number>>;
}

/** Browse the dex with server-side sorting and paging.
 *
 * Sorting has to happen on the server: sorting a page in the browser only
 * reorders the rows it already has, so anything outside the first page - most
 * Mega forms, anything not in the current meta - could never be found by
 * sorting on a stat, however far you scrolled. */
export async function browsePokemon(options: BrowseOptions = {}): Promise<PokemonPage> {
  const params = new URLSearchParams();
  if (options.search) params.set("search", options.search);
  if (options.sort) params.set("sort", options.sort);
  if (options.order) params.set("order", options.order);
  if (options.types && options.types.length > 0) params.set("types", options.types.join(","));
  if (options.ability) params.set("ability", options.ability);
  for (const [stat, value] of Object.entries(options.minStats ?? {})) {
    params.set(`min_${stat}`, String(value));
  }
  for (const [stat, value] of Object.entries(options.maxStats ?? {})) {
    params.set(`max_${stat}`, String(value));
  }
  params.set("limit", String(options.limit ?? 100));
  params.set("offset", String(options.offset ?? 0));

  const res = await fetch(`${API_BASE}/api/pokemon?${params.toString()}`);
  if (!res.ok) throw new Error(`Pokemon browse failed: ${res.status}`);
  const items = (await res.json()) as PokemonSummary[];
  const total = Number(res.headers.get("X-Total-Count") ?? items.length);
  return { items, total };
}

export function getPokemon(name: string): Promise<PokemonDetail> {
  return getJson<PokemonDetail>(`/api/pokemon/${encodeURIComponent(name)}`);
}

export function searchItems(query: string): Promise<ItemOut[]> {
  const params = query ? `?search=${encodeURIComponent(query)}` : "";
  return getJson<ItemOut[]>(`/api/items${params}`);
}

// --- standalone Moves / Abilities / Items browsers --------------------------
//
// The team builder's pickers (searchItems above, MovePicker, AbilityPicker)
// already existed but only ever searched within one Pokemon's learnset. These
// browse the full reference data on their own pages, with real filters and a
// reverse lookup ("which Pokemon actually have this").

export interface ReferencePage<T> {
  items: T[];
  total: number;
}

async function getPagedJson<T>(path: string): Promise<ReferencePage<T>> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request to ${path} failed: ${res.status}`);
  const items = (await res.json()) as T[];
  const total = Number(res.headers.get("X-Total-Count") ?? items.length);
  return { items, total };
}

export interface MoveBrowseOptions {
  search?: string;
  type?: string;
  category?: string;
  minPower?: number;
  maxPower?: number;
  limit?: number;
  offset?: number;
}

export function browseMoves(options: MoveBrowseOptions = {}): Promise<ReferencePage<MoveOut>> {
  const params = new URLSearchParams();
  if (options.search) params.set("search", options.search);
  if (options.type) params.set("type", options.type);
  if (options.category) params.set("category", options.category);
  if (options.minPower != null) params.set("min_power", String(options.minPower));
  if (options.maxPower != null) params.set("max_power", String(options.maxPower));
  params.set("limit", String(options.limit ?? 50));
  params.set("offset", String(options.offset ?? 0));
  return getPagedJson<MoveOut>(`/api/moves?${params.toString()}`);
}

export function getMoveLearners(name: string): Promise<PokemonSummary[]> {
  return getJson<PokemonSummary[]>(`/api/moves/${encodeURIComponent(name)}/learners`);
}

export function browseAbilities(search = "", limit = 50, offset = 0): Promise<ReferencePage<AbilityOut>> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return getPagedJson<AbilityOut>(`/api/abilities?${params.toString()}`);
}

export function getAbilityHolders(name: string): Promise<PokemonSummary[]> {
  return getJson<PokemonSummary[]>(`/api/abilities/${encodeURIComponent(name)}/pokemon`);
}

export function browseItems(search = "", limit = 50, offset = 0): Promise<ReferencePage<ItemOut>> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return getPagedJson<ItemOut>(`/api/items?${params.toString()}`);
}

export interface UsageEntry {
  name: string;
  percent: number | null;
  /** Dex slug, populated for teammates so they can be added to a team.
   *  Null for moves/items/abilities, and for names we can't match. */
  slug?: string | null;
  sprite_url?: string | null;
}

/** A real EV spread players actually run. Champions gives 66 EV points
 *  total with a maximum of 32 in any one stat. */
export interface SpreadEntry {
  nature: string;
  evs: Record<string, number>;
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
  spreads: SpreadEntry[];
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

export interface TeamCoreOut {
  size: number;
  rank: number;
  pokemon: string[];
  sprites: (string | null)[];
  /** Our dex slug per name; null where the name doesn't resolve to a Pokemon
   *  we hold, so importing can skip it and say so. */
  slugs: (string | null)[];
  teams: number | null;
  usage_percent: number | null;
}

export function getTeamCores(size = 0): Promise<TeamCoreOut[]> {
  return getJson<TeamCoreOut[]>(`/api/meta/cores${size ? `?size=${size}` : ""}`);
}

export interface TopTeamOut {
  rank: number;
  author: string | null;
  record: string | null;
  tournament: string | null;
  pokemon: string[];
  sprites: (string | null)[];
  slugs: (string | null)[];
}

export function getTopTeams(contains = ""): Promise<TopTeamOut[]> {
  const params = contains ? `?contains=${encodeURIComponent(contains)}` : "";
  return getJson<TopTeamOut[]>(`/api/meta/top-teams${params}`);
}

export interface UsageTrendPoint {
  scraped_at: string;
  rank: number;
  win_rate: number | null;
}

export function getUsageTrend(name: string): Promise<UsageTrendPoint[]> {
  return getJson<UsageTrendPoint[]>(`/api/meta/trend/${encodeURIComponent(name)}`);
}

export interface DataFreshness {
  format: string | null;
  tracked_pokemon: number;
  last_updated: string | null;
  snapshot_count: number;
  sources: string[];
}

/** When the meta data was last pulled, and where from - so the site never
 *  presents a number with no indication of how current it is. */
export function getDataFreshness(): Promise<DataFreshness> {
  return getJson<DataFreshness>("/api/meta/freshness");
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

/** How one of your Pokemon fares against one meta Pokemon, in both directions. */
export interface MatchupCell {
  target_name: string;
  target_display_name: string;
  target_sprite: string | null;
  target_rank: number;
  best_move: string | null;
  damage_dealt_pct: number | null;
  incoming_move: string | null;
  damage_taken_pct: number | null;
}

export interface TeamMatchupRow {
  pokemon_name: string;
  display_name: string;
  sprite_url: string | null;
  avg_damage_dealt: number | null;
  avg_damage_taken: number | null;
  ko_count: number;
  survives_count: number;
  cells: MatchupCell[];
}

export interface TeamMatchupMember {
  pokemon_name: string;
  evs?: Record<string, number>;
  nature?: string;
  ability?: string | null;
  item?: string | null;
  level?: number;
  moves?: string[];
}

/** The whole Breaker/Waller matrix in one request.
 *
 * Done server-side because computing it in the browser needs
 * (team size x pool size x moves) round-trips - roughly 600 for a full team
 * against the top 25, which was slow and hammered the API.
 *
 * Pass `opponentTeamRank` to test against one real tournament team's roster
 * instead of the ranked meta pool - poolSize is ignored when it's set. */
export function calcTeamMatchups(
  team: TeamMatchupMember[],
  poolSize = 25,
  field: object = {},
  opponentTeamRank?: number
): Promise<TeamMatchupRow[]> {
  return postJson<TeamMatchupRow[]>("/api/calc/team-matchups", {
    team,
    opponent_team_rank: opponentTeamRank,
    pool_size: poolSize,
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


// --- Meta Calcs ------------------------------------------------------------

export interface VersusSide {
  pokemon_name: string;
  display_name: string;
  sprite_url: string | null;
  speed: number;
  moves_first: boolean;
  /** The set this number was actually calculated with, so an applied ability
   *  is distinguishable from a blank one. */
  ability: string;
  item: string;
  spread: string;
  /** Parts of the set left blank ("ability", "item", "EVs"). */
  missing: string[];
}

export interface VersusMoveResult {
  move_name: string;
  move_display_name: string;
  /** Full Showdown-style line, e.g. "32+ Atk Life Orb Garchomp Earthquake
   *  vs. 32 HP / 0 Def Falinks: 112-132 (71.8 - 84.6%)". */
  description: string;
  ko_text: string | null;
  pct_low: number | null;
  pct_high: number | null;
  verdict: "good" | "warning" | "bad";
  immune: boolean;
}

export interface VersusPair {
  attacker: VersusSide;
  defender: VersusSide;
  results: VersusMoveResult[];
}

/** Every Meta Calcs mode is the same question - these attackers against these
 *  defenders - so one call serves all four. */
export function calcVersus(
  attackers: TeamMatchupMember[],
  defenders: TeamMatchupMember[],
  field: object = {}
): Promise<VersusPair[]> {
  return postJson<VersusPair[]>("/api/calc/versus", { attackers, defenders, field });
}

export interface MetaPoolEntryOut {
  pokemon_name: string;
  display_name: string;
  sprite_url: string | null;
  rank: number;
  base_speed: number;
  ability: string;
  item: string;
  nature: string;
  evs: Record<string, number>;
  /** The most-used spreads, not just the top one. Usage is often fragmented -
   *  Charizard-Mega-Y's bulky spread leads on 7.0% while the standard fast set
   *  sits on 5.6% - so one spread misrepresents what you actually face. */
  spreads: SpreadEntry[];
  moves: string[];
}

/** The ranked meta as calc-ready targets, each with its most-used set. */
export function getMetaPool(offset = 0, limit = 20): Promise<{ total: number; items: MetaPoolEntryOut[] }> {
  return getJson<{ total: number; items: MetaPoolEntryOut[] }>(
    `/api/calc/meta-pool?offset=${offset}&limit=${limit}`
  );
}

export interface TopTeamRoster {
  rank: number;
  author: string | null;
  record: string | null;
  tournament: string | null;
  /** Each member built with its own real most-used set - we don't have
   *  per-team spreads, so this is each Pokemon's individual tracked usage,
   *  the same data Breaker/Waller and the meta pool use. A member with no
   *  tracked usage of its own comes back with real base stats but a blank set. */
  roster: MetaPoolEntryOut[];
}

/** One real tournament team's six Pokemon, ready to run in Meta Calcs'
 *  Team vs Team mode - "vs a popular team" using that team's actual sets. */
export function getTopTeamRoster(rank: number): Promise<TopTeamRoster> {
  return getJson<TopTeamRoster>(`/api/calc/top-team-roster/${rank}`);
}

export interface TournamentRosterSlot {
  pokemon_name: string;
  evs: Record<string, number>;
  nature: string;
  ability?: string | null;
  item?: string | null;
  moves: string[];
}

export interface TournamentRosterSlotOut extends TournamentRosterSlot {
  display_name: string;
  sprite_url: string | null;
}

export interface TournamentResultIn {
  placement: number;
  player?: string | null;
  roster: TournamentRosterSlot[];
  notes?: string | null;
  is_dark_horse: boolean;
}

export interface TournamentResultOut {
  id: number;
  placement: number;
  player: string | null;
  roster: TournamentRosterSlotOut[];
  notes: string | null;
  is_dark_horse: boolean;
}

export interface TournamentIn {
  name: string;
  date: string;
  format?: string;
  player_count?: number | null;
  source_url?: string | null;
  notes?: string | null;
}

export interface TournamentSummary {
  id: number;
  name: string;
  date: string;
  format: string;
  player_count: number | null;
  result_count: number;
}

export interface MostBroughtEntry {
  pokemon_name: string;
  display_name: string;
  sprite_url: string | null;
  count: number;
}

export interface TournamentStatEntry {
  pokemon_name: string;
  display_name: string;
  sprite_url: string | null;
  count: number;
  share_percent: number | null;
  points: number | null;
}

export interface TournamentDetail {
  id: number;
  name: string;
  date: string;
  format: string;
  player_count: number | null;
  source_url: string | null;
  notes: string | null;
  results: TournamentResultOut[];
  most_brought: MostBroughtEntry[];
  tournament_stats: TournamentStatEntry[];
}

export interface TournamentSearchHit {
  tournament_id: number;
  tournament_name: string;
  tournament_date: string;
  result_id: number;
  player: string | null;
  placement: number;
}

export function getTournaments(): Promise<TournamentSummary[]> {
  return getJson<TournamentSummary[]>("/api/tournaments");
}

export function getTournament(id: number): Promise<TournamentDetail> {
  return getJson<TournamentDetail>(`/api/tournaments/${id}`);
}

export function searchTournamentsByPokemon(pokemonName: string): Promise<TournamentSearchHit[]> {
  return getJson<TournamentSearchHit[]>(`/api/tournaments/search?pokemon=${encodeURIComponent(pokemonName)}`);
}

export function createTournament(body: TournamentIn): Promise<TournamentSummary> {
  return postJson<TournamentSummary>("/api/tournaments", body);
}

export function updateTournament(id: number, body: TournamentIn): Promise<TournamentSummary> {
  return putJson<TournamentSummary>(`/api/tournaments/${id}`, body);
}

export function deleteTournament(id: number): Promise<void> {
  return deleteJson(`/api/tournaments/${id}`);
}

export function addTournamentResult(tournamentId: number, body: TournamentResultIn): Promise<TournamentResultOut> {
  return postJson<TournamentResultOut>(`/api/tournaments/${tournamentId}/results`, body);
}

export function updateTournamentResult(
  tournamentId: number,
  resultId: number,
  body: TournamentResultIn
): Promise<TournamentResultOut> {
  return putJson<TournamentResultOut>(`/api/tournaments/${tournamentId}/results/${resultId}`, body);
}

export function deleteTournamentResult(tournamentId: number, resultId: number): Promise<void> {
  return deleteJson(`/api/tournaments/${tournamentId}/results/${resultId}`);
}
