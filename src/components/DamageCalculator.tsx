import { useEffect, useState } from "react";
import { calcDamage } from "../api";
import type { MoveOut, DamageCalcResult } from "../api";
import TargetPicker from "./TargetPicker";
import type { TargetSpec } from "./TargetPicker";
import { TYPE_COLORS } from "../typeColors";
import "./DamageCalculator.css";

interface MoveResult {
  move: MoveOut;
  result: DamageCalcResult;
}

function barColor(pctHigh: number | null | undefined): string {
  if (pctHigh == null) return "#ccc";
  if (pctHigh >= 100) return "#2a9d4a";
  if (pctHigh >= 50) return "#d4a017";
  return "#c0392b";
}

function summaryLine(attacker: TargetSpec, defender: TargetSpec, move: MoveOut, r: DamageCalcResult): string {
  const evParts: string[] = [];
  if (attacker.evs.atk) evParts.push(`${attacker.evs.atk} Atk`);
  if (attacker.evs.spa) evParts.push(`${attacker.evs.spa} SpA`);
  const atkLabel = [attacker.item, ...evParts, attacker.pokemon.display_name].filter(Boolean).join(" ");
  const defEvParts: string[] = [];
  if (defender.evs.hp) defEvParts.push(`${defender.evs.hp} HP`);
  if (defender.evs.def) defEvParts.push(`${defender.evs.def} Def`);
  if (defender.evs.spd) defEvParts.push(`${defender.evs.spd} SpD`);
  const defLabel = [...defEvParts, defender.pokemon.display_name].filter(Boolean).join(" / ");
  if (r.error) return r.error;
  if (r.immune) return r.reason ?? "No effect.";
  return `${atkLabel} ${move.display_name} vs. ${defLabel}: ${r.dmg_low}-${r.dmg_high} (${r.pct_low}% - ${r.pct_high}%) -- ${r.ko_text}`;
}

function MoveResultsColumn({
  attacker,
  defender,
  field,
  selectedMove,
  onSelectMove,
}: {
  attacker: TargetSpec;
  defender: TargetSpec;
  field: { weather: string; crit: boolean };
  selectedMove: string | null;
  onSelectMove: (moveName: string, result: DamageCalcResult) => void;
}) {
  const [results, setResults] = useState<MoveResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const damagingMoves = attacker.pokemon.moves.filter((m) => m.category !== "status" && m.power);
    setResults(null);
    Promise.all(
      damagingMoves.map(async (move) => {
        try {
          const result = await calcDamage(
            { pokemon_name: attacker.pokemon.name, evs: attacker.evs, nature: attacker.nature, ability: attacker.ability, item: attacker.item, level: 50 },
            { pokemon_name: defender.pokemon.name, evs: defender.evs, nature: defender.nature, ability: defender.ability, item: defender.item, level: 50 },
            move.name,
            field
          );
          return { move, result };
        } catch {
          return null;
        }
      })
    ).then((rows) => {
      if (cancelled) return;
      const valid = rows.filter((r): r is MoveResult => r !== null && !r.result.error);
      valid.sort((a, b) => (b.result.pct_high ?? 0) - (a.result.pct_high ?? 0));
      setResults(valid);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    attacker.pokemon.name, attacker.evs, attacker.nature, attacker.ability, attacker.item,
    defender.pokemon.name, defender.evs, defender.nature, defender.ability, defender.item,
    field.weather, field.crit,
  ]);

  return (
    <div className="move-results-column">
      <h3>{attacker.pokemon.display_name}'s Moves (select one to show detailed results)</h3>
      {!results && <p className="subtitle">Calculating...</p>}
      {results && results.length === 0 && <p className="subtitle">No damaging moves known.</p>}
      <div className="move-results-list">
        {results?.map(({ move, result }) => {
          const isSelected = selectedMove === move.name;
          const pct = result.immune ? 0 : (result.pct_high ?? 0);
          return (
            <button
              key={move.id}
              className={isSelected ? "move-result-bar selected" : "move-result-bar"}
              onClick={() => onSelectMove(move.name, result)}
            >
              <div className="move-result-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: barColor(pct) }} />
              <span className="move-result-bar-name">{move.display_name}</span>
              <span className="move-result-bar-pct">
                {result.immune ? "0% - 0%" : `${result.pct_low}% - ${result.pct_high}%`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DamageCalculator() {
  const [p1, setP1] = useState<TargetSpec | null>(null);
  const [p2, setP2] = useState<TargetSpec | null>(null);
  const [weather, setWeather] = useState("none");
  const [crit, setCrit] = useState(false);
  const [selected, setSelected] = useState<{ attacker: "p1" | "p2"; move: string; result: DamageCalcResult } | null>(null);

  const field = { weather, crit };

  return (
    <div className="damage-calculator">
      <h2>Damage Calculator</h2>

      <div className="calc-field-controls">
        <label>
          Weather
          <select value={weather} onChange={(e) => setWeather(e.target.value)}>
            <option value="none">None</option>
            <option value="sun">Sun</option>
            <option value="rain">Rain</option>
            <option value="sand">Sand</option>
            <option value="snow">Snow</option>
          </select>
        </label>
        <label className="calc-crit-toggle">
          <input type="checkbox" checked={crit} onChange={(e) => setCrit(e.target.checked)} />
          Critical hit
        </label>
      </div>

      <div className="calc-builders">
        <TargetPicker label="Pokemon 1" target={p1} onChange={setP1} />
        <TargetPicker label="Pokemon 2" target={p2} onChange={setP2} />
      </div>

      {p1 && p2 && (
        <div className="calc-results-columns">
          <MoveResultsColumn
            attacker={p1}
            defender={p2}
            field={field}
            selectedMove={selected?.attacker === "p1" ? selected.move : null}
            onSelectMove={(move, result) => setSelected({ attacker: "p1", move, result })}
          />
          <MoveResultsColumn
            attacker={p2}
            defender={p1}
            field={field}
            selectedMove={selected?.attacker === "p2" ? selected.move : null}
            onSelectMove={(move, result) => setSelected({ attacker: "p2", move, result })}
          />
        </div>
      )}

      {selected && p1 && p2 && (
        <div className="calc-detail">
          {(() => {
            const attacker = selected.attacker === "p1" ? p1 : p2;
            const defender = selected.attacker === "p1" ? p2 : p1;
            const move = attacker.pokemon.moves.find((m) => m.name === selected.move);
            if (!move) return null;
            return (
              <>
                <div className="calc-detail-header">
                  {attacker.pokemon.sprite_url && <img src={attacker.pokemon.sprite_url} alt="" />}
                  <strong>{attacker.pokemon.display_name}</strong>
                  <span className="vs-label">vs.</span>
                  {defender.pokemon.sprite_url && <img src={defender.pokemon.sprite_url} alt="" />}
                  <strong>{defender.pokemon.display_name}</strong>
                </div>
                <div className="calc-detail-move">
                  <span className="type-badge" style={{ background: TYPE_COLORS[move.type] ?? TYPE_COLORS.unknown }}>
                    {move.type}
                  </span>
                  <strong>{move.display_name}</strong>
                </div>
                {selected.result.immune ? (
                  <p>{selected.result.reason}</p>
                ) : (
                  <>
                    <p className="calc-detail-damage">
                      {selected.result.dmg_low}-{selected.result.dmg_high} ({selected.result.pct_low}% - {selected.result.pct_high}%)
                    </p>
                    <p className="ko-text">{selected.result.ko_text}</p>
                  </>
                )}
                <p className="calc-summary-line">{summaryLine(attacker, defender, move, selected.result)}</p>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
