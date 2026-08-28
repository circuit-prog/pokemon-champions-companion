import type { SavedTeam } from "../teamStorage";
import { ALL_TYPES, typeEffectiveness } from "../typeChart";
import "./TypeMatchupsPanel.css";

function cellClass(mult: number): string {
  if (mult === 0) return "matchup-cell immune";
  if (mult >= 4) return "matchup-cell quad-weak";
  if (mult === 2) return "matchup-cell weak";
  if (mult === 1) return "matchup-cell neutral";
  if (mult === 0.5) return "matchup-cell resist";
  return "matchup-cell quad-resist"; // 0.25
}

function cellLabel(mult: number): string {
  if (mult === 0) return "0";
  if (mult === 1) return "-";
  return `${mult}x`;
}

export default function TypeMatchupsPanel({ team }: { team: SavedTeam }) {
  return (
    <div className="type-matchups-panel">
      <p className="subtitle">
        How each team member's typing holds up defensively against every attacking type. Green = resists, red = weak,
        black = immune.
      </p>
      <div className="matchup-scroll">
        <table className="matchup-table">
          <thead>
            <tr>
              <th>Type</th>
              {team.slots.map((s) => (
                <th key={s.pokemon.id}>
                  <div className="matchup-mon-header">
                    {s.pokemon.sprite_url && <img src={s.pokemon.sprite_url} alt="" />}
                    <span>{s.pokemon.display_name}</span>
                  </div>
                </th>
              ))}
              <th>Weak on team</th>
            </tr>
          </thead>
          <tbody>
            {ALL_TYPES.map((atkType) => {
              const mults = team.slots.map((s) => typeEffectiveness(atkType, [s.pokemon.type1, s.pokemon.type2]));
              const weakCount = mults.filter((m) => m >= 2).length;
              return (
                <tr key={atkType}>
                  <td className="matchup-type-label">{atkType}</td>
                  {mults.map((m, i) => (
                    <td key={i} className={cellClass(m)}>
                      {cellLabel(m)}
                    </td>
                  ))}
                  <td className="matchup-weak-count">{weakCount > 0 ? `${weakCount}/${team.slots.length}` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
