import { useState } from "react";
import { calcSurvival } from "../api";
import type { SurvivalResult } from "../api";
import type { TargetSpec } from "./TargetPicker";
import "./SurvivalMinimizer.css";

const STAT_LABEL: Record<string, string> = { def: "Def", spd: "SpD" };

export default function SurvivalMinimizer({
  attacker,
  defender,
  field,
  toCombatant,
  onApply,
}: {
  attacker: TargetSpec;
  defender: TargetSpec;
  field: object;
  toCombatant: (t: TargetSpec) => object;
  /** Write the solved spread back into the defender's EVs. */
  onApply: (hpEv: number, defStatKey: string, defEv: number) => void;
}) {
  const [moveName, setMoveName] = useState("");
  const [hpPercent, setHpPercent] = useState(1);
  const [result, setResult] = useState<SurvivalResult | null>(null);
  const [loading, setLoading] = useState(false);

  const damagingMoves = attacker.pokemon.moves.filter((m) => m.category !== "status" && m.power);

  async function run() {
    if (!moveName) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await calcSurvival(
        toCombatant(attacker) as never,
        toCombatant(defender) as never,
        moveName,
        hpPercent,
        field
      );
      setResult(r);
    } catch {
      setResult({ found: false, reason: "Calculation failed. Is the backend running?" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="survival-minimizer">
      <h3>Survival EV Minimizer</h3>
      <p className="subtitle">
        Find the cheapest EV spread for <strong>{defender.pokemon.display_name}</strong> to survive{" "}
        <strong>{attacker.pokemon.display_name}</strong>'s attack (worst-case damage roll).
      </p>

      <div className="survival-controls">
        <label className="field">
          Survive with at least
          <div className="survival-hp-input">
            <input
              type="number"
              min={1}
              max={99}
              value={hpPercent}
              onChange={(e) => setHpPercent(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            />
            <span>% HP left</span>
          </div>
        </label>

        <label className="field">
          Against move
          <select value={moveName} onChange={(e) => setMoveName(e.target.value)}>
            <option value="">-- choose move --</option>
            {damagingMoves.map((m) => (
              <option key={m.id} value={m.name}>
                {m.display_name} ({m.power})
              </option>
            ))}
          </select>
        </label>

        <button className="survival-run-btn" onClick={run} disabled={!moveName || loading}>
          {loading ? "Solving..." : "Calculate EVs"}
        </button>
      </div>

      {result && !result.found && <div className="survival-fail">{result.reason}</div>}

      {result?.found && (
        <div className="survival-result">
          <div className="survival-spread">
            {result.total_evs === 0 ? (
              <strong>Survives with no EV investment.</strong>
            ) : (
              <strong>
                {result.hp_ev} HP / {result.def_ev} {STAT_LABEL[result.def_stat_key ?? "def"]} ({result.total_evs} EVs
                total)
              </strong>
            )}
          </div>
          <div className="survival-detail">
            Worst case: {result.worst_case_damage} damage ({result.worst_case_percent}% of {result.resulting_hp} HP)
          </div>
          {result.total_evs != null && result.total_evs > 0 && (
            <button
              className="survival-apply-btn"
              onClick={() => onApply(result.hp_ev ?? 0, result.def_stat_key ?? "def", result.def_ev ?? 0)}
            >
              Apply to {defender.pokemon.display_name}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
