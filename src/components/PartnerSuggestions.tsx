import { useEffect, useState } from "react";
import { getPokemonUsage, searchPokemon } from "../api";
import type { PokemonSummary } from "../api";
import type { SavedTeam } from "../teamStorage";
import "./PartnerSuggestions.css";

interface Suggestion {
  displayName: string;
  summary: PokemonSummary | null;
  /** How many of the current team members list this Pokemon as a common teammate. */
  sharedBy: number;
}

/**
 * Suggests teammates based on real co-usage: for every Pokemon already on the
 * team we look at who they're actually paired with in tracked play, then rank
 * the names that come up most often (and aren't already on the team).
 */
export default function PartnerSuggestions({
  team,
  onPick,
}: {
  team: SavedTeam;
  onPick: (p: PokemonSummary) => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  const memberKey = team.slots.map((s) => s.pokemon.name).join(",");

  useEffect(() => {
    let cancelled = false;
    setSuggestions(null);

    async function run() {
      if (team.slots.length === 0) {
        if (!cancelled) setSuggestions([]);
        return;
      }

      const usages = await Promise.all(
        team.slots.map((s) => getPokemonUsage(s.pokemon.name).catch(() => null))
      );

      // Tally how many current members each candidate partners with.
      const onTeam = new Set(team.slots.map((s) => s.pokemon.display_name.toLowerCase()));
      const counts = new Map<string, number>();
      for (const usage of usages) {
        for (const mate of usage?.teammates ?? []) {
          if (onTeam.has(mate.name.toLowerCase())) continue;
          counts.set(mate.name, (counts.get(mate.name) ?? 0) + 1);
        }
      }

      const ranked = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

      // Resolve each name to something we can actually add to the team.
      const resolved = await Promise.all(
        ranked.map(async ([displayName, sharedBy]): Promise<Suggestion> => {
          try {
            const matches = await searchPokemon(displayName);
            const exact =
              matches.find((m) => m.display_name.toLowerCase() === displayName.toLowerCase()) ??
              matches.find((m) => m.name.startsWith(displayName.toLowerCase())) ??
              null;
            return { displayName, summary: exact, sharedBy };
          } catch {
            return { displayName, summary: null, sharedBy };
          }
        })
      );

      if (!cancelled) setSuggestions(resolved);
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey]);

  if (team.slots.length === 0 || team.slots.length >= 6) return null;
  if (!suggestions) return null;
  if (suggestions.length === 0) {
    return (
      <div className="partner-suggestions">
        <span className="partner-label">Suggested partners</span>
        <span className="partner-empty">
          No co-usage data for this team yet (only tracked meta Pokemon have partner stats).
        </span>
      </div>
    );
  }

  return (
    <div className="partner-suggestions">
      <span className="partner-label">
        Suggested partners <span className="partner-hint">— who these Pokemon are actually paired with</span>
      </span>
      <div className="partner-chips">
        {suggestions.map((s) => (
          <button
            key={s.displayName}
            className="partner-chip"
            disabled={!s.summary}
            title={s.summary ? `Add ${s.displayName}` : `${s.displayName} isn't in our Pokedex`}
            onClick={() => s.summary && onPick(s.summary)}
          >
            {s.summary?.sprite_url && <img src={s.summary.sprite_url} alt="" />}
            {s.displayName}
            {s.sharedBy > 1 && <span className="partner-count">x{s.sharedBy}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
