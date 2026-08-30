// Turning real Pokemon Champions usage data into a ready-to-use team slot.
//
// The usage data names things the way a human writes them ("Assault Vest",
// "Sucker Punch") while a team slot stores our internal slugs
// ("assault-vest", "sucker-punch"), so everything here is really about
// resolving one to the other against our own database.
//
// What we can fill in and what we can't:
//   - item, ability, moves  -> real tracked usage data, so these are genuine
//   - nature, EVs           -> NOT published by the usage source at all, so we
//                              deliberately leave them alone rather than
//                              inventing numbers and passing them off as real
import { getPokemon, getPokemonUsage, searchItems } from "./api";
import type { PokemonDetail, PokemonUsageOut } from "./api";
import type { TeamSlotData, EvSpread } from "./teamStorage";

export const EMPTY_EVS: EvSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

/** The parts of a set we can fill in from real usage data. */
export interface TopSet {
  item: string;
  ability: string;
  moves: string[];
}

const MAX_MOVES = 4;

/** Resolve an item's display name ("Assault Vest") to its slug. */
async function resolveItemSlug(displayName: string): Promise<string> {
  try {
    const matches = await searchItems(displayName);
    const exact = matches.find((i) => i.display_name.toLowerCase() === displayName.toLowerCase());
    return exact?.name ?? "";
  } catch {
    return "";
  }
}

/** Work out this Pokemon's most-used item, ability and top four moves.
 *
 *  Moves keep their usage order including status moves - Protect really is
 *  part of the most-used set, even though it deals no damage. */
export async function resolveTopSet(
  detail: PokemonDetail,
  usage: PokemonUsageOut | null
): Promise<TopSet> {
  if (!usage) return { item: "", ability: "", moves: [] };

  const moves: string[] = [];
  for (const entry of usage.moves ?? []) {
    if (moves.length >= MAX_MOVES) break;
    const match = detail.moves.find((m) => m.display_name.toLowerCase() === entry.name.toLowerCase());
    if (match && !moves.includes(match.name)) moves.push(match.name);
  }

  let ability = "";
  const topAbility = usage.abilities?.[0]?.name;
  if (topAbility) {
    const match = detail.abilities.find((a) => a.display_name.toLowerCase() === topAbility.toLowerCase());
    if (match) ability = match.name;
  }

  const topItem = usage.items?.[0]?.name;
  const item = topItem ? await resolveItemSlug(topItem) : "";

  return { item, ability, moves };
}

/** Build a complete team slot for a Pokemon, with its most-used set already
 *  applied where we have the data for it.
 *
 *  Used everywhere a Pokemon gets added to a team, so that adding a tracked
 *  Pokemon gives you a working set immediately instead of six blank fields. */
export async function buildSlot(pokemonName: string): Promise<TeamSlotData> {
  const detail = await getPokemon(pokemonName);

  // Most Pokemon have no tracked usage - that's expected, not an error.
  let usage: PokemonUsageOut | null = null;
  try {
    usage = await getPokemonUsage(pokemonName);
    // Usage is recorded against the base species ("raichu", "mawile") while
    // teams name the Mega form ("raichu-mega-y"), so fall back to the base
    // species - otherwise importing a team leaves every Mega blank.
    if (!usage && pokemonName.includes("-mega")) {
      usage = await getPokemonUsage(pokemonName.split("-mega")[0]);
    }
  } catch {
    usage = null;
  }

  const top = await resolveTopSet(detail, usage);

  return {
    pokemon: detail,
    ability: top.ability,
    item: top.item,
    nature: "hardy",
    evs: { ...EMPTY_EVS },
    moves: top.moves,
    usage,
  };
}

/** Build slots for a whole roster (a team core, or a tournament team).
 *
 *  Names that don't resolve to a Pokemon in our dex are skipped, and reported
 *  back so the caller can tell the user what was left out rather than
 *  silently handing them a short team. */
export async function buildSlots(
  pokemonNames: string[]
): Promise<{ slots: TeamSlotData[]; skipped: string[] }> {
  const slots: TeamSlotData[] = [];
  const skipped: string[] = [];

  for (const name of pokemonNames) {
    try {
      slots.push(await buildSlot(name));
    } catch {
      skipped.push(name);
    }
  }

  return { slots, skipped };
}
