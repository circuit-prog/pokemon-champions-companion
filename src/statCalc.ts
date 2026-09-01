// Live stat preview, mirroring backend/app/damage_calc.py's stat_at_level().
// Kept in sync by hand since this is a small formula; if it ever grows more
// complex, move the calc server-side and fetch it instead of duplicating.
import { NATURES, type StatKey } from "./natures";

const IV = 31; // assume perfect IVs for the builder preview

// Champions rescaled the classic EV system rather than replacing it: 32 points
// per stat instead of 252, and 66 per team instead of 508. One Champions point
// is worth 8 classic EVs, and because the classic formula divides EVs by 4,
// that lands as multiplying by 2 here. Verified against Pikalytics' numbers
// for a Jolly 2/32/0/0/0/32 Garchomp - all six stats match exactly with it,
// and only the zero-EV ones match without it.
const EV_TO_STAT_POINTS = 2;

export function statAtLevel(base: number, ev: number, level: number, statKey: StatKey, nature: string): number {
  const points = ev * EV_TO_STAT_POINTS;
  if (statKey === "hp") {
    return Math.floor(((2 * base + IV + points) * level) / 100) + level + 10;
  }
  const raw = Math.floor(((2 * base + IV + points) * level) / 100) + 5;
  const [boosted, lowered] = NATURES[nature.toLowerCase()] ?? [null, null];
  if (boosted === statKey) return Math.floor(raw * 1.1);
  if (lowered === statKey) return Math.floor(raw * 0.9);
  return raw;
}
