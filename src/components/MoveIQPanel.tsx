import type { SavedTeam } from "../teamStorage";
import { ALL_TYPES, typeEffectiveness } from "../typeChart";
import { TYPE_COLORS } from "../typeColors";
import "./MoveIQPanel.css";

interface CoverageEntry {
  defType: string;
  bestMult: number;
  moveName: string | null;
  monName: string | null;
  monSprite: string | null;
}

function computeCoverage(team: SavedTeam): CoverageEntry[] {
  return ALL_TYPES.map((defType) => {
    let best: CoverageEntry = { defType, bestMult: 0, moveName: null, monName: null, monSprite: null };
    for (const slot of team.slots) {
      const moves = slot.pokemon.moves.filter((m) => slot.moves.includes(m.name) && m.category !== "status" && m.power);
      for (const move of moves) {
        const mult = typeEffectiveness(move.type, [defType]);
        if (mult > best.bestMult) {
          best = { defType, bestMult: mult, moveName: move.display_name, monName: slot.pokemon.display_name, monSprite: slot.pokemon.sprite_url };
        }
      }
    }
    return best;
  });
}

function cellClass(mult: number): string {
  if (mult === 0) return "coverage-cell none";
  if (mult >= 2) return "coverage-cell super";
  if (mult === 1) return "coverage-cell neutral";
  return "coverage-cell resisted";
}

export default function MoveIQPanel({ team }: { team: SavedTeam }) {
  const coverage = computeCoverage(team);
  const gaps = coverage.filter((c) => c.bestMult <= 1);

  return (
    <div className="moveiq-panel">
      <p className="subtitle">
        For every defending type, this shows your team's single best selected move against it (by type
        effectiveness only - doesn't account for stats, abilities, or items).
      </p>

      {gaps.length > 0 && (
        <div className="coverage-gaps-banner">
          No super-effective move against: {gaps.map((g) => g.defType).join(", ")}
        </div>
      )}

      <div className="coverage-grid">
        {coverage.map((c) => (
          <div key={c.defType} className={cellClass(c.bestMult)}>
            <span
              className="type-badge"
              style={{ background: TYPE_COLORS[c.defType] ?? TYPE_COLORS.unknown }}
            >
              {c.defType}
            </span>
            {c.moveName ? (
              <div className="coverage-detail">
                <span className="coverage-mult">{c.bestMult}x</span>
                <span className="coverage-move">{c.moveName}</span>
                <span className="coverage-mon">
                  {c.monSprite && <img src={c.monSprite} alt="" />}
                  {c.monName}
                </span>
              </div>
            ) : (
              <div className="coverage-detail">
                <span className="coverage-move">No move selected covers this type</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
