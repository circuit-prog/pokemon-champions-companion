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

interface Suggestion {
  defType: string;
  moveName: string;
  moveType: string;
  mult: number;
  power: number;
  usagePercent: number | null; // how often real players run this move, if known
  stab: boolean;
  monName: string;
  monSprite: string | null;
}

/** For every type the team can't hit super-effectively, look through what its
 *  Pokemon can actually learn and suggest a move that would fix the gap.
 *
 *  Candidates are ranked by real usage first - a move that top players
 *  genuinely run is a far more useful suggestion than an obscure one that
 *  happens to have the right type - then by STAB, then raw power. */
function computeSuggestions(team: SavedTeam, gapTypes: string[]): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const defType of gapTypes) {
    const candidates: Suggestion[] = [];

    for (const slot of team.slots) {
      // What real players run on this Pokemon, as a lookup of name -> percent.
      const usageByName = new Map<string, number>();
      for (const entry of slot.usage?.moves ?? []) {
        usageByName.set(entry.name.toLowerCase(), entry.percent ?? 0);
      }

      const monTypes = [slot.pokemon.type1, slot.pokemon.type2].filter(Boolean) as string[];

      for (const move of slot.pokemon.moves) {
        if (move.category === "status" || !move.power) continue;
        if (slot.moves.includes(move.name)) continue; // already on the set
        const mult = typeEffectiveness(move.type, [defType]);
        if (mult < 2) continue;

        candidates.push({
          defType,
          moveName: move.display_name,
          moveType: move.type,
          mult,
          power: move.power,
          usagePercent: usageByName.get(move.display_name.toLowerCase()) ?? null,
          stab: monTypes.includes(move.type),
          monName: slot.pokemon.display_name,
          monSprite: slot.pokemon.sprite_url,
        });
      }
    }

    candidates.sort((a, b) => {
      // Moves with real usage data always outrank moves without it.
      if ((b.usagePercent ?? -1) !== (a.usagePercent ?? -1)) {
        return (b.usagePercent ?? -1) - (a.usagePercent ?? -1);
      }
      if (a.stab !== b.stab) return a.stab ? -1 : 1;
      return b.power - a.power;
    });

    // Keep the best option per Pokemon so one broad learnset can't fill the
    // whole list with near-identical suggestions.
    const seenMons = new Set<string>();
    for (const candidate of candidates) {
      if (seenMons.has(candidate.monName)) continue;
      seenMons.add(candidate.monName);
      suggestions.push(candidate);
      if (seenMons.size >= 3) break;
    }
  }

  return suggestions;
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
  const suggestions = computeSuggestions(team, gaps.map((g) => g.defType));
  const byGapType = gaps
    .map((gap) => ({ defType: gap.defType, options: suggestions.filter((s) => s.defType === gap.defType) }))
    .filter((g) => g.options.length > 0);

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

      {byGapType.length > 0 && (
        <div className="coverage-suggestions">
          <h4>Recommended moves to close these gaps</h4>
          <p className="subtitle">
            Moves your Pokemon can already learn that would hit the uncovered types super-effectively, ranked by
            how often real players actually run them.
          </p>
          {byGapType.map((gap) => (
            <div className="suggestion-group" key={gap.defType}>
              <span
                className="type-badge"
                style={{ background: TYPE_COLORS[gap.defType] ?? TYPE_COLORS.unknown }}
              >
                {gap.defType}
              </span>
              <div className="suggestion-options">
                {gap.options.map((option) => (
                  <div className="suggestion" key={`${option.monName}-${option.moveName}`}>
                    {option.monSprite && <img src={option.monSprite} alt="" />}
                    <span className="suggestion-move">{option.moveName}</span>
                    <span
                      className="type-badge small"
                      style={{ background: TYPE_COLORS[option.moveType] ?? TYPE_COLORS.unknown }}
                    >
                      {option.moveType}
                    </span>
                    <span className="suggestion-meta">
                      {option.mult}x · {option.power} BP{option.stab ? " · STAB" : ""}
                      {option.usagePercent !== null ? ` · ${option.usagePercent}% usage` : " · not in usage data"}
                    </span>
                    <span className="suggestion-mon">on {option.monName}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
