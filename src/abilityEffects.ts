// Abilities that change what a type does to a Pokemon.
//
// The type chart alone gets these matchups actively wrong: a Levitate Pokemon
// is not merely resistant to Ground, it cannot be hit by it at all, and a
// Flash Fire Pokemon takes nothing from Fire. Leaving them out made the team's
// defensive picture look worse than it is in exactly the cases that matter
// most when choosing a switch-in.

/** ability slug -> the attacking type it nullifies */
export const IMMUNITY_ABILITIES: Record<string, string> = {
  levitate: "ground",
  "flash-fire": "fire",
  "water-absorb": "water",
  "dry-skin": "water",
  "storm-drain": "water",
  "volt-absorb": "electric",
  "lightning-rod": "electric",
  "motor-drive": "electric",
  "sap-sipper": "grass",
  "earth-eater": "ground",
  "well-baked-body": "fire",
  "purifying-salt": "", // halves Ghost rather than nullifying; handled below
};

/** ability slug -> {type: multiplier} for abilities that scale rather than nullify */
export const RESIST_ABILITIES: Record<string, Record<string, number>> = {
  "thick-fat": { fire: 0.5, ice: 0.5 },
  heatproof: { fire: 0.5 },
  "water-bubble": { fire: 0.5 },
  "purifying-salt": { ghost: 0.5 },
};

/**
 * Type effectiveness against one Pokemon, accounting for its ability.
 *
 * `baseMultiplier` is what the type chart alone says; this adjusts it.
 */
export function effectivenessWithAbility(
  baseMultiplier: number,
  attackingType: string,
  ability: string
): number {
  const slug = (ability || "").toLowerCase();
  if (IMMUNITY_ABILITIES[slug] && IMMUNITY_ABILITIES[slug] === attackingType) return 0;
  const scaled = RESIST_ABILITIES[slug]?.[attackingType];
  return scaled !== undefined ? baseMultiplier * scaled : baseMultiplier;
}
