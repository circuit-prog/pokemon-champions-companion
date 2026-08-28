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

// Pokemon Champions uses its own EV system: each stat gets its own 0-31 point
// allocation added directly (not the classic 0-252-per-stat/508-total system).
export const MAX_EV_PER_STAT = 31;
