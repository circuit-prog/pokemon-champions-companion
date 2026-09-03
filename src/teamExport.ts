// Mirrors showdownImport.ts's parser in reverse: a saved team out to
// Pokemon Showdown's plain-text set format, so a team can leave the site
// the same way it can enter (Import from Showdown already existed; this
// closes the round trip).
import type { StatKey } from "./natures";
import type { SavedTeam, TeamSlotData } from "./teamStorage";

const STAT_ORDER: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
const SHOWDOWN_STAT_LABEL: Record<StatKey, string> = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

function exportSlot(slot: TeamSlotData): string {
  const lines: string[] = [];
  lines.push(slot.item ? `${slot.pokemon.display_name} @ ${titleCase(slot.item)}` : slot.pokemon.display_name);
  if (slot.ability) lines.push(`Ability: ${titleCase(slot.ability)}`);

  const evParts = STAT_ORDER.filter((k) => slot.evs[k]).map((k) => `${slot.evs[k]} ${SHOWDOWN_STAT_LABEL[k]}`);
  if (evParts.length > 0) lines.push(`EVs: ${evParts.join(" / ")}`);
  lines.push(`${slot.nature.charAt(0).toUpperCase() + slot.nature.slice(1)} Nature`);

  for (const m of slot.moves) {
    const known = slot.pokemon.moves.find((pm) => pm.name === m)?.display_name;
    lines.push(`- ${known ?? titleCase(m)}`);
  }

  return lines.join("\n");
}

export function exportTeamToShowdown(team: SavedTeam): string {
  return team.slots.map(exportSlot).join("\n\n");
}
