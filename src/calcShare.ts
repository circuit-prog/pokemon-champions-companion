// Encode/decode damage-calculator state into a shareable URL, and export
// builds in Pokemon Showdown's plain-text set format.
import { getPokemon } from "./api";
import type { TargetSpec } from "./components/TargetPicker";
import { defaultTargetSpec } from "./components/TargetPicker";
import type { StatKey } from "./natures";

const STAT_ORDER: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const SHOWDOWN_STAT_LABEL: Record<StatKey, string> = {
  hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe",
};

/** Compact serialisable form — keeps URLs short by dropping defaults. */
interface PackedSide {
  n: string; // pokemon name
  na?: string; // nature
  a?: string; // ability
  i?: string; // item
  l?: number; // level
  s?: string; // status
  hp?: number; // current hp percent
  e?: Partial<Record<StatKey, number>>; // evs (non-zero only)
  st?: Partial<Record<StatKey, number>>; // stages (non-zero only)
}

function pack(t: TargetSpec): PackedSide {
  const evs: Partial<Record<StatKey, number>> = {};
  STAT_ORDER.forEach((k) => {
    if (t.evs[k]) evs[k] = t.evs[k];
  });
  const stages: Partial<Record<StatKey, number>> = {};
  STAT_ORDER.forEach((k) => {
    if (t.stages[k]) stages[k] = t.stages[k];
  });
  const packed: PackedSide = { n: t.pokemon.name };
  if (t.nature !== "hardy") packed.na = t.nature;
  if (t.ability) packed.a = t.ability;
  if (t.item) packed.i = t.item;
  if (t.level !== 50) packed.l = t.level;
  if (t.status !== "healthy") packed.s = t.status;
  if (t.currentHpPercent !== 100) packed.hp = t.currentHpPercent;
  if (Object.keys(evs).length) packed.e = evs;
  if (Object.keys(stages).length) packed.st = stages;
  return packed;
}

async function unpack(p: PackedSide): Promise<TargetSpec> {
  const detail = await getPokemon(p.n);
  const spec = defaultTargetSpec(detail, p.a ?? "", p.i ?? "");
  if (p.na) spec.nature = p.na;
  if (p.l) spec.level = p.l;
  if (p.s) spec.status = p.s;
  if (p.hp) spec.currentHpPercent = p.hp;
  if (p.e) Object.assign(spec.evs, p.e);
  if (p.st) spec.stages = { ...p.st };
  return spec;
}

export function buildShareUrl(p1: TargetSpec, p2: TargetSpec, field: object): string {
  const payload = { p1: pack(p1), p2: pack(p2), f: field };
  // encodeURIComponent + base64 keeps unicode-safe and URL-safe.
  const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
  const url = new URL(window.location.href);
  url.searchParams.set("calc", encoded);
  return url.toString();
}

export async function readShareUrl(): Promise<{ p1: TargetSpec; p2: TargetSpec; field: object } | null> {
  const encoded = new URLSearchParams(window.location.search).get("calc");
  if (!encoded) return null;
  try {
    const payload = JSON.parse(decodeURIComponent(atob(encoded)));
    const [p1, p2] = await Promise.all([unpack(payload.p1), unpack(payload.p2)]);
    return { p1, p2, field: payload.f ?? {} };
  } catch {
    return null; // malformed link — fall back to an empty calculator
  }
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Pokemon Showdown plain-text set format, the de-facto sharing standard. */
export function exportShowdownSet(t: TargetSpec): string {
  const lines: string[] = [];
  lines.push(t.item ? `${t.pokemon.display_name} @ ${titleCase(t.item)}` : t.pokemon.display_name);
  if (t.ability) lines.push(`Ability: ${titleCase(t.ability)}`);
  if (t.level !== 50) lines.push(`Level: ${t.level}`);

  const evParts = STAT_ORDER.filter((k) => t.evs[k]).map((k) => `${t.evs[k]} ${SHOWDOWN_STAT_LABEL[k]}`);
  if (evParts.length) lines.push(`EVs: ${evParts.join(" / ")}`);

  lines.push(`${t.nature.charAt(0).toUpperCase() + t.nature.slice(1)} Nature`);

  // The calculator has no move slots of its own, so export the Pokemon's
  // most-used moves if we know them; otherwise omit the move list.
  return lines.join("\n");
}
