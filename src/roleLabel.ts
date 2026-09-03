// Nothing in the interface named what a Pokemon actually does in a battle,
// so the stat table meant little to someone without prior competitive
// knowledge. This derives a rough role label - not a precise classification,
// just enough of a hint to read a stat spread by.
import type { PokemonSummary, PokemonUsageOut } from "./api";

export type RoleLabel = "Speed control" | "Support" | "Wall" | "Physical attacker" | "Special attacker" | "Mixed attacker";

const SPEED_CONTROL_MOVES = new Set([
  "tailwind",
  "trick-room",
  "thunder-wave",
  "stun-spore",
  "glare",
  "icy-wind",
  "electroweb",
  "rock-tomb",
  "bulldoze",
]);

// Protect/Wide Guard are deliberately excluded - they're run by nearly every
// Pokemon in doubles regardless of role, so they're not a useful signal.
const SUPPORT_MOVES = new Set([
  "helping-hand",
  "follow-me",
  "rage-powder",
  "light-screen",
  "reflect",
  "aromatherapy",
  "heal-pulse",
  "spore",
]);

/** Base-stats-only estimate, for contexts (the Pokedex table) that don't have
 *  a Pokemon's real moveset in hand. Less precise than `roleLabel` below. */
export function roleLabelFromStats(p: Pick<PokemonSummary, "hp" | "attack" | "defense" | "special_attack" | "special_defense" | "speed">): RoleLabel {
  const bulk = p.hp + p.defense + p.special_defense;
  const offense = Math.max(p.attack, p.special_attack);
  if (bulk >= 320 && offense < 110) return "Wall";
  if (p.attack > p.special_attack * 1.15) return "Physical attacker";
  if (p.special_attack > p.attack * 1.15) return "Special attacker";
  return "Mixed attacker";
}

/** The precise version: factors in the Pokemon's actual most-used moves
 *  (speed control / support utility) when we have real usage data for it. */
export function roleLabel(
  p: Pick<PokemonSummary, "hp" | "attack" | "defense" | "special_attack" | "special_defense" | "speed">,
  usage: PokemonUsageOut | null
): RoleLabel {
  const topMoves = new Set((usage?.moves ?? []).slice(0, 4).map((m) => m.name.toLowerCase()));
  for (const m of topMoves) {
    if (SPEED_CONTROL_MOVES.has(m)) return "Speed control";
  }
  for (const m of topMoves) {
    if (SUPPORT_MOVES.has(m)) return "Support";
  }
  return roleLabelFromStats(p);
}
