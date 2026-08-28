// name -> [boosted stat, lowered stat]. null/null means neutral.
// Mirrors backend/app/damage_calc.py NATURES so frontend stat previews match the calculator exactly.
export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

export const NATURES: Record<string, [StatKey | null, StatKey | null]> = {
  hardy: [null, null], lonely: ["atk", "def"], brave: ["atk", "spe"],
  adamant: ["atk", "spa"], naughty: ["atk", "spd"], bold: ["def", "atk"],
  docile: [null, null], relaxed: ["def", "spe"], impish: ["def", "spa"],
  lax: ["def", "spd"], timid: ["spe", "atk"], hasty: ["spe", "def"],
  serious: [null, null], jolly: ["spe", "spa"], naive: ["spe", "spd"],
  modest: ["spa", "atk"], mild: ["spa", "def"], quiet: ["spa", "spe"],
  bashful: [null, null], rash: ["spa", "spd"], calm: ["spd", "atk"],
  gentle: ["spd", "def"], sassy: ["spd", "spe"], careful: ["spd", "spa"],
  quirky: [null, null],
};

export const NATURE_NAMES = Object.keys(NATURES);

const STAT_FULL_NAMES: Record<StatKey, string> = {
  hp: "HP", atk: "Attack", def: "Defense", spa: "Special Attack", spd: "Special Defense", spe: "Speed",
};

export function natureDescription(name: string): string {
  const [boosted, lowered] = NATURES[name.toLowerCase()] ?? [null, null];
  if (!boosted || !lowered) return "No effect on stats.";
  return `+10% ${STAT_FULL_NAMES[boosted]}, -10% ${STAT_FULL_NAMES[lowered]}.`;
}

// Pokemon Champions EV system: IVs are fixed at 31 for every stat on every
// Pokemon (no IV breeding/hyper training). EVs are a 66-point budget shared
// across all 6 stats, with a 32-point cap on any single stat.
export const MAX_EV_PER_STAT = 32;
export const EV_TOTAL_BUDGET = 66;
