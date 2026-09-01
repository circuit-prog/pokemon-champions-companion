import { useState } from "react";
import type { SavedTeam } from "../teamStorage";
import { ALL_TYPES, typeEffectiveness } from "../typeChart";
import { TYPE_COLORS } from "../typeColors";
import { effectivenessWithAbility } from "../abilityEffects";
import "./TypeMatchupsPanel.css";

// Three letters, because two collide: Fire/Fighting both start "FI" and
// Grass/Ground both start "GR", which made the header unreadable.
const TYPE_ABBR: Record<string, string> = {
  normal: "NOR", fire: "FIR", water: "WAT", electric: "ELE", grass: "GRS",
  ice: "ICE", fighting: "FIG", poison: "POI", ground: "GRD", flying: "FLY",
  psychic: "PSY", bug: "BUG", rock: "ROC", ghost: "GHO", dragon: "DRA",
  dark: "DRK", steel: "STL", fairy: "FAI",
};

/** The five things worth knowing about your team for a given attacking type.
 *
 * The first three are defensive (what that type does to you), the last two
 * offensive (what you do to it) - so one grid answers both directions instead
 * of the defence-only table this panel used to be. */
const ROWS = [
  { key: "weak", label: "Weak", hint: "team members this type hits super-effectively" },
  { key: "resist", label: "Resist", hint: "team members that resist this type" },
  { key: "immune", label: "Immune", hint: "team members immune to this type" },
  { key: "effective", label: "Effective", hint: "team members with a move that hits this type super-effectively" },
  { key: "stab", label: "STAB Eff", hint: "team members whose same-type move hits this type super-effectively" },
] as const;

type RowKey = (typeof ROWS)[number]["key"];

interface Cell {
  count: number;
  members: string[];
}

function buildMatrix(team: SavedTeam): Record<string, Record<RowKey, Cell>> {
  const matrix: Record<string, Record<RowKey, Cell>> = {};

  for (const attackingType of ALL_TYPES) {
    const cells: Record<RowKey, Cell> = {
      weak: { count: 0, members: [] },
      resist: { count: 0, members: [] },
      immune: { count: 0, members: [] },
      effective: { count: 0, members: [] },
      stab: { count: 0, members: [] },
    };

    for (const slot of team.slots) {
      const name = slot.pokemon.display_name;
      const defTypes = [slot.pokemon.type1, slot.pokemon.type2];

      // Defence, with the Pokemon's ability taken into account - Levitate and
      // Flash Fire change the answer entirely, not just by a step.
      const base = typeEffectiveness(attackingType, defTypes);
      const effective = effectivenessWithAbility(base, attackingType, slot.ability);

      if (effective === 0) {
        cells.immune.count++;
        cells.immune.members.push(name);
      } else if (effective > 1) {
        cells.weak.count++;
        cells.weak.members.push(name);
      } else if (effective < 1) {
        cells.resist.count++;
        cells.resist.members.push(name);
      }

      // Offence: does anything this Pokemon actually has selected hit that
      // type hard, and is it STAB?
      const damaging = slot.pokemon.moves.filter(
        (m) => slot.moves.includes(m.name) && m.category !== "status" && m.power
      );
      const superEffective = damaging.filter((m) => typeEffectiveness(m.type, [attackingType]) > 1);
      if (superEffective.length > 0) {
        cells.effective.count++;
        cells.effective.members.push(name);
        if (superEffective.some((m) => defTypes.includes(m.type))) {
          cells.stab.count++;
          cells.stab.members.push(name);
        }
      }
    }

    matrix[attackingType] = cells;
  }

  return matrix;
}

/** Colour scales by row, because a high count means something different in
 *  each: three Pokemon weak to Ice is a problem, three resisting it is not. */
function cellStyle(row: RowKey, count: number, teamSize: number): React.CSSProperties {
  if (count === 0) return {};
  const strength = Math.min(1, count / Math.max(1, Math.min(teamSize, 3)));
  const alpha = 0.18 + strength * 0.5;
  const colours: Record<RowKey, string> = {
    weak: `rgba(200, 60, 45, ${alpha})`,
    resist: `rgba(35, 140, 85, ${alpha})`,
    immune: `rgba(90, 105, 130, ${alpha})`,
    effective: `rgba(214, 145, 20, ${alpha})`,
    stab: `rgba(150, 80, 200, ${alpha})`,
  };
  return { background: colours[row] };
}

export default function TypeMatchupsPanel({ team }: { team: SavedTeam }) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (team.slots.length === 0) {
    return <p className="subtitle">Add some Pokemon to your team first.</p>;
  }

  const matrix = buildMatrix(team);
  const teamSize = team.slots.length;

  // The types nobody on the team can hit hard, and the ones several members
  // fold to - the two things actually worth acting on.
  const noCoverage = ALL_TYPES.filter((t) => matrix[t].effective.count === 0);
  const shared = ALL_TYPES.filter((t) => matrix[t].weak.count >= 2);

  return (
    <div className="type-matchups-panel">
      <p className="subtitle">
        Every attacking type, both directions at once. The top three rows are what that type does to
        your team; the bottom two are what your team does back. Abilities that grant immunity
        (Levitate, Flash Fire, Water Absorb and so on) are taken into account.
      </p>

      {(shared.length > 0 || noCoverage.length > 0) && (
        <div className="type-summary">
          {shared.length > 0 && (
            <p>
              <strong>Shared weakness:</strong> {shared.length} type{shared.length > 1 ? "s" : ""} hit two or
              more of your team super-effectively — {shared.join(", ")}.
            </p>
          )}
          {noCoverage.length > 0 && (
            <p>
              <strong>No super-effective answer to:</strong> {noCoverage.join(", ")}.
            </p>
          )}
        </div>
      )}

      <div className="type-grid-scroll">
        <table className="type-grid">
          <thead>
            <tr>
              <th />
              {ALL_TYPES.map((t) => (
                <th key={t}>
                  <span
                    className="type-dot"
                    style={{ background: TYPE_COLORS[t] ?? TYPE_COLORS.unknown }}
                    title={t}
                    onMouseEnter={() => setHovered(t)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {TYPE_ABBR[t] ?? t.slice(0, 3).toUpperCase()}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key}>
                <th className="type-row-label" title={row.hint}>
                  {row.label}
                </th>
                {ALL_TYPES.map((t) => {
                  const cell = matrix[t][row.key];
                  return (
                    <td
                      key={t}
                      style={cellStyle(row.key, cell.count, teamSize)}
                      className={cell.count === 0 ? "zero" : ""}
                      title={
                        cell.count === 0
                          ? `No team member: ${row.label} vs ${t}`
                          : `${row.label} vs ${t}: ${cell.members.join(", ")}`
                      }
                    >
                      {cell.count}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hovered && <p className="type-hover-note">Hovering: {hovered}</p>}
    </div>
  );
}
