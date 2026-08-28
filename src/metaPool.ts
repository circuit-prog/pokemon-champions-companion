// Shared data prep for Breaker/Waller: a small pool of real top-meta
// Pokemon (with their real top move + top ability) to test a team against.
// Capped to keep the number of damage-calc API calls reasonable.
import { getMetaRankings, getPokemon, getPokemonUsage } from "./api";
import type { PokemonDetail } from "./api";

export interface MetaPoolEntry {
  pokemon: PokemonDetail;
  topMoveName: string | null; // move.name (slug), not display_name
  topAbility: string;
}

export async function loadMetaPool(limit = 10): Promise<MetaPoolEntry[]> {
  const rankings = await getMetaRankings();
  const top = rankings.slice(0, limit);

  const entries = await Promise.all(
    top.map(async (r): Promise<MetaPoolEntry | null> => {
      try {
        const [pokemon, usage] = await Promise.all([getPokemon(r.name), getPokemonUsage(r.name)]);
        const topMoveDisplayName = usage?.moves[0]?.name.toLowerCase();
        const topMove = pokemon.moves.find((m) => m.display_name.toLowerCase() === topMoveDisplayName);
        const topAbilityDisplayName = usage?.abilities[0]?.name.toLowerCase();
        const topAbility = pokemon.abilities.find((a) => a.display_name.toLowerCase() === topAbilityDisplayName);
        return {
          pokemon,
          topMoveName: topMove?.name ?? null,
          topAbility: topAbility?.name ?? "",
        };
      } catch {
        return null;
      }
    })
  );

  return entries.filter((e): e is MetaPoolEntry => e !== null);
}
