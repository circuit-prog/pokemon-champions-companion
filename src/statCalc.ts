// Live stat preview, mirroring backend/app/damage_calc.py's stat_at_level().
// Kept in sync by hand since this is a small formula; if it ever grows more
// complex, move the calc server-side and fetch it instead of duplicating.
import { NATURES, type StatKey } from "./natures";

const IV = 31; // assume perfect IVs for the builder preview

export function statAtLevel(base: number, ev: number, level: number, statKey: StatKey, nature: string): number {
  if (statKey === "hp") {
    return Math.floor(((2 * base + IV + ev) * level) / 100) + level + 10;
  }
  const raw = Math.floor(((2 * base + IV + ev) * level) / 100) + 5;
  const [boosted, lowered] = NATURES[nature.toLowerCase()] ?? [null, null];
  if (boosted === statKey) return Math.floor(raw * 1.1);
  if (lowered === statKey) return Math.floor(raw * 0.9);
  return raw;
}
