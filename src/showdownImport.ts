// Parse Pokemon Showdown's plain-text team format into our TeamSlotData.
// This is the mirror of exportShowdownSet() in calcShare.ts, and the format
// most of the competitive community uses to share teams.
//
// A set looks like:
//   Garchomp (M) @ Life Orb
//   Ability: Rough Skin
//   Level: 50
//   EVs: 32 Atk / 20 HP
//   Adamant Nature
//   - Earthquake
//   - Dragon Claw
//
// Sets are separated by blank lines. Everything except the first line is
// optional, and real exports vary (nicknames, genders, shininess, IVs), so
// the parser is deliberately lenient: unknown lines are skipped rather than
// failing the whole import.
import { getPokemon, searchPokemon, searchItems } from "./api";
import type { TeamSlotData } from "./teamStorage";
import type { StatKey } from "./natures";

const EMPTY_EVS: Record<StatKey, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const EV_LABEL_TO_KEY: Record<string, StatKey> = {
  hp: "hp", atk: "atk", def: "def", spa: "spa", spd: "spd", spe: "spe",
};

export interface ImportedSet {
  speciesName: string; // as written, e.g. "Garchomp"
  item: string | null;
  ability: string | null;
  level: number | null;
  nature: string | null;
  evs: Record<StatKey, number>;
  moveNames: string[]; // display names as written
}

/** Split raw text into individual sets and parse each one structurally. */
export function parseShowdownText(text: string): ImportedSet[] {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks.map(parseBlock).filter((s): s is ImportedSet => s !== null);
}

function parseBlock(block: string): ImportedSet | null {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const set: ImportedSet = {
    speciesName: "",
    item: null,
    ability: null,
    level: null,
    nature: null,
    evs: { ...EMPTY_EVS },
    moveNames: [],
  };

  // First line: "Nickname (Species) (M) @ Item" in its most complex form.
  let header = lines[0];
  const atIndex = header.lastIndexOf(" @ ");
  if (atIndex !== -1) {
    set.item = header.slice(atIndex + 3).trim();
    header = header.slice(0, atIndex).trim();
  }
  header = header.replace(/\s*\((M|F)\)\s*$/i, "").trim(); // strip gender
  const nicknameMatch = header.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  set.speciesName = (nicknameMatch ? nicknameMatch[2] : header).trim();
  if (!set.speciesName) return null;

  for (const line of lines.slice(1)) {
    if (line.startsWith("- ")) {
      set.moveNames.push(line.slice(2).trim());
    } else if (/^Ability:/i.test(line)) {
      set.ability = line.replace(/^Ability:/i, "").trim();
    } else if (/^Level:/i.test(line)) {
      const n = parseInt(line.replace(/^Level:/i, "").trim(), 10);
      if (!Number.isNaN(n)) set.level = n;
    } else if (/^EVs:/i.test(line)) {
      for (const part of line.replace(/^EVs:/i, "").split("/")) {
        const m = part.trim().match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
        if (m) {
          const key = EV_LABEL_TO_KEY[m[2].toLowerCase()];
          if (key) set.evs[key] = parseInt(m[1], 10);
        }
      }
    } else if (/\bNature\b/i.test(line)) {
      set.nature = line.replace(/\s*Nature\s*$/i, "").trim().toLowerCase();
    }
    // IVs, Shiny, Tera Type, Happiness etc. are intentionally ignored.
  }

  return set;
}

/** Resolve a parsed set against our database into a usable team slot. */
export async function resolveSet(set: ImportedSet): Promise<TeamSlotData | null> {
  const slug = set.speciesName.toLowerCase().replace(/[\s.']/g, "-");

  let pokemon;
  try {
    pokemon = await getPokemon(slug);
  } catch {
    // Fall back to a name search (handles "Basculegion" -> "basculegion-male" etc.)
    try {
      const matches = await searchPokemon(set.speciesName);
      const best =
        matches.find((p) => p.display_name.toLowerCase() === set.speciesName.toLowerCase()) ?? matches[0];
      if (!best) return null;
      pokemon = await getPokemon(best.name);
    } catch {
      return null;
    }
  }

  // Match ability by display name against what this Pokemon can actually have.
  let ability = "";
  if (set.ability) {
    const match = pokemon.abilities.find(
      (a) => a.display_name.toLowerCase() === set.ability!.toLowerCase()
    );
    if (match) ability = match.name;
  }

  let item = "";
  if (set.item) {
    try {
      const matches = await searchItems(set.item);
      const match = matches.find((i) => i.display_name.toLowerCase() === set.item!.toLowerCase());
      if (match) item = match.name;
    } catch {
      // leave item blank if lookup fails
    }
  }

  // Match moves by display name against this Pokemon's legal movepool.
  const moves: string[] = [];
  for (const moveName of set.moveNames) {
    const match = pokemon.moves.find((m) => m.display_name.toLowerCase() === moveName.toLowerCase());
    if (match && moves.length < 4) moves.push(match.name);
  }

  return {
    pokemon,
    ability,
    item,
    nature: set.nature ?? "hardy",
    evs: { ...EMPTY_EVS, ...set.evs },
    moves,
    usage: null,
  };
}

export interface ImportOutcome {
  slots: TeamSlotData[];
  failed: string[]; // species names we couldn't resolve
}

export async function importShowdownTeam(text: string): Promise<ImportOutcome> {
  const parsed = parseShowdownText(text);
  const slots: TeamSlotData[] = [];
  const failed: string[] = [];

  for (const set of parsed.slice(0, 6)) {
    const slot = await resolveSet(set);
    if (slot) slots.push(slot);
    else failed.push(set.speciesName);
  }

  return { slots, failed };
}
