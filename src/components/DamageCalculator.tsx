import { useEffect, useState } from "react";
import { calcDamage } from "../api";
import type { MoveOut, DamageCalcResult } from "../api";
import TargetPicker from "./TargetPicker";
import type { TargetSpec } from "./TargetPicker";
import SurvivalMinimizer from "./SurvivalMinimizer";
import { buildShareUrl, readShareUrl, exportShowdownSet } from "../calcShare";
import { TYPE_COLORS } from "../typeColors";
import { loadTeams } from "../teamStorage";
import type { SavedTeam, TeamSlotData } from "../teamStorage";
import "./DamageCalculator.css";

/** A saved team slot as the calculator wants it. Team slots and TargetSpec
 *  use the same EV shape (StatKey-keyed), so this is a direct copy, not a
 *  conversion - only the battle-state fields (level/status/HP/stages) that a
 *  saved slot has no opinion on get calculator defaults. */
function slotToTargetSpec(slot: TeamSlotData): TargetSpec {
  return {
    pokemon: slot.pokemon,
    nature: slot.nature,
    evs: slot.evs,
    ability: slot.ability,
    item: slot.item,
    level: 50,
    status: "healthy",
    currentHpPercent: 100,
    stages: {},
  };
}

/** Dropdown that fills a calculator side from an already-built team slot,
 *  so checking a matchup you've already built doesn't mean retyping the set
 *  you already have saved. */
function LoadFromTeam({ onPick }: { onPick: (spec: TargetSpec) => void }) {
  const [teams, setTeams] = useState<SavedTeam[]>([]);

  useEffect(() => {
    setTeams(loadTeams());
  }, []);

  const hasAny = teams.some((t) => t.slots.length > 0);
  if (!hasAny) return null;

  return (
    <label className="load-from-team">
      <span>Load from a team</span>
      <select
        value=""
        onChange={(e) => {
          const [teamId, slotIndexStr] = e.target.value.split("::");
          const team = teams.find((t) => t.id === teamId);
          const slot = team?.slots[Number(slotIndexStr)];
          if (slot) onPick(slotToTargetSpec(slot));
          e.target.value = "";
        }}
      >
        <option value="" disabled>
          Choose a Pokemon...
        </option>
        {teams
          .filter((t) => t.slots.length > 0)
          .map((t) => (
            <optgroup key={t.id} label={t.name}>
              {t.slots.map((s, i) => (
                <option key={`${t.id}-${i}`} value={`${t.id}::${i}`}>
                  {s.pokemon.display_name}
                </option>
              ))}
            </optgroup>
          ))}
      </select>
    </label>
  );
}

interface FieldState {
  crit: boolean;
  weather: string;
  terrain: string;
  reflect: boolean;
  lightscreen: boolean;
  helping_hand: boolean;
  friend_guard: boolean;
  doubles: boolean;
  spread_move: boolean;
}

const DEFAULT_FIELD: FieldState = {
  crit: false,
  weather: "none",
  terrain: "none",
  reflect: false,
  lightscreen: false,
  helping_hand: false,
  friend_guard: false,
  doubles: false,
  spread_move: false,
};

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

function toCombatant(t: TargetSpec) {
  return {
    pokemon_name: t.pokemon.name,
    evs: t.evs,
    nature: t.nature,
    ability: t.ability,
    item: t.item,
    level: t.level,
    stages: t.stages,
    status: t.status,
    current_hp_percent: t.currentHpPercent,
  };
}

function summaryLine(attacker: TargetSpec, defender: TargetSpec, move: MoveOut, r: DamageCalcResult): string {
  if (r.error) return r.error;
  if (r.immune) return r.reason ?? "No effect.";

  const atkParts: string[] = [];
  const boost = attacker.stages.atk ?? attacker.stages.spa ?? 0;
  if (boost) atkParts.push(boost > 0 ? `+${boost}` : `${boost}`);
  if (attacker.evs.atk) atkParts.push(`${attacker.evs.atk} Atk`);
  if (attacker.evs.spa) atkParts.push(`${attacker.evs.spa} SpA`);
  if (attacker.item) atkParts.push(attacker.item.replace(/-/g, " "));
  atkParts.push(attacker.pokemon.display_name);

  const defParts: string[] = [];
  if (defender.evs.hp) defParts.push(`${defender.evs.hp} HP`);
  if (defender.evs.def) defParts.push(`${defender.evs.def} Def`);
  if (defender.evs.spd) defParts.push(`${defender.evs.spd} SpD`);
  const defLabel = defParts.length
    ? `${defParts.join(" / ")} ${defender.pokemon.display_name}`
    : defender.pokemon.display_name;

  return `${atkParts.join(" ")} ${move.display_name} vs. ${defLabel}: ${r.dmg_low}-${r.dmg_high} (${r.pct_low} - ${r.pct_high}%) -- ${r.ko_text}`;
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
  field: FieldState;
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
          const result = await calcDamage(toCombatant(attacker), toCombatant(defender), move.name, field);
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
  }, [JSON.stringify(toCombatant(attacker)), JSON.stringify(toCombatant(defender)), JSON.stringify(field)]);

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

function FieldControls({ field, onChange }: { field: FieldState; onChange: (f: FieldState) => void }) {
  const toggle = (key: keyof FieldState) => onChange({ ...field, [key]: !field[key] });

  return (
    <div className="calc-field-controls">
      <div className="field-row">
        <div className="field-group">
          <span className="field-group-label">Format</span>
          <div className="segmented">
            <button className={!field.doubles ? "active" : ""} onClick={() => onChange({ ...field, doubles: false })}>
              Singles
            </button>
            <button className={field.doubles ? "active" : ""} onClick={() => onChange({ ...field, doubles: true })}>
              Doubles
            </button>
          </div>
        </div>

        <label className="field-inline">
          Weather
          <select value={field.weather} onChange={(e) => onChange({ ...field, weather: e.target.value })}>
            <option value="none">None</option>
            <option value="sun">Sun</option>
            <option value="rain">Rain</option>
            <option value="sand">Sand</option>
            <option value="snow">Snow</option>
          </select>
        </label>

        <label className="field-inline">
          Terrain
          <select value={field.terrain} onChange={(e) => onChange({ ...field, terrain: e.target.value })}>
            <option value="none">None</option>
            <option value="electric">Electric</option>
            <option value="grassy">Grassy</option>
            <option value="misty">Misty</option>
            <option value="psychic">Psychic</option>
          </select>
        </label>
      </div>

      <div className="field-row">
        <span className="field-group-label">Defender protected by</span>
        <button className={field.reflect ? "toggle-chip active" : "toggle-chip"} onClick={() => toggle("reflect")}>
          Reflect
        </button>
        <button
          className={field.lightscreen ? "toggle-chip active" : "toggle-chip"}
          onClick={() => toggle("lightscreen")}
        >
          Light Screen
        </button>
        <button
          className={field.friend_guard ? "toggle-chip active" : "toggle-chip"}
          onClick={() => toggle("friend_guard")}
        >
          Friend Guard
        </button>
      </div>

      <div className="field-row">
        <span className="field-group-label">Attacker boosted by</span>
        <button
          className={field.helping_hand ? "toggle-chip active" : "toggle-chip"}
          onClick={() => toggle("helping_hand")}
        >
          Helping Hand
        </button>
        <button className={field.crit ? "toggle-chip active" : "toggle-chip"} onClick={() => toggle("crit")}>
          Critical Hit
        </button>
        {field.doubles && (
          <button
            className={field.spread_move ? "toggle-chip active" : "toggle-chip"}
            onClick={() => toggle("spread_move")}
            title="Spread moves hit multiple targets for 0.75x damage each"
          >
            Spread Move
          </button>
        )}
      </div>
    </div>
  );
}

export default function DamageCalculator() {
  const [p1, setP1] = useState<TargetSpec | null>(null);
  const [p2, setP2] = useState<TargetSpec | null>(null);
  const [field, setField] = useState<FieldState>(DEFAULT_FIELD);
  const [selected, setSelected] = useState<{ attacker: "p1" | "p2"; move: string; result: DamageCalcResult } | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Restore a shared calc from ?calc=... on first load.
  useEffect(() => {
    readShareUrl().then((restored) => {
      if (!restored) return;
      setP1(restored.p1);
      setP2(restored.p2);
      setField({ ...DEFAULT_FIELD, ...(restored.field as Partial<FieldState>) });
    });
  }, []);

  function copyText(text: string, message: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setToast(message);
        setTimeout(() => setToast(null), 1800);
      },
      () => {}
    );
  }

  function copySummary(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  }

  function applySurvivalSpread(hpEv: number, defStatKey: string, defEv: number) {
    if (!p2) return;
    setP2({ ...p2, evs: { ...p2.evs, hp: hpEv, [defStatKey]: defEv } as typeof p2.evs });
  }

  return (
    <div className="damage-calculator">
      <h2>Damage Calculator</h2>

      <FieldControls field={field} onChange={setField} />

      <div className="calc-builders">
        <div className="calc-builder-col">
          <LoadFromTeam onPick={setP1} />
          <TargetPicker label="Pokemon 1" target={p1} onChange={setP1} advanced />
        </div>
        <div className="calc-builder-col">
          <LoadFromTeam onPick={setP2} />
          <TargetPicker label="Pokemon 2" target={p2} onChange={setP2} advanced />
        </div>
      </div>

      {p1 && p2 && (
        <div className="calc-export-row">
          <button className="calc-export-btn" onClick={() => copyText(buildShareUrl(p1, p2, field), "Link copied")}>
            Copy shareable link
          </button>
          <button
            className="calc-export-btn"
            onClick={() => copyText(exportShowdownSet(p1), `${p1.pokemon.display_name} set copied`)}
          >
            Export {p1.pokemon.display_name} set
          </button>
          <button
            className="calc-export-btn"
            onClick={() => copyText(exportShowdownSet(p2), `${p2.pokemon.display_name} set copied`)}
          >
            Export {p2.pokemon.display_name} set
          </button>
          {toast && <span className="calc-toast">{toast}</span>}
        </div>
      )}

      {p1 && p2 && (
        <SurvivalMinimizer
          attacker={p1}
          defender={p2}
          field={field}
          toCombatant={toCombatant}
          onApply={applySurvivalSpread}
        />
      )}

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
            const line = summaryLine(attacker, defender, move, selected.result);
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
                      {selected.result.dmg_low}-{selected.result.dmg_high} ({selected.result.pct_low}% -{" "}
                      {selected.result.pct_high}%)
                    </p>
                    <p className="ko-text">{selected.result.ko_text}</p>
                    {selected.result.rolls && (
                      <p className="calc-rolls">({selected.result.rolls.join(", ")})</p>
                    )}
                  </>
                )}
                <div className="calc-summary-row">
                  <p className="calc-summary-line">{line}</p>
                  <button className="calc-copy-btn" onClick={() => copySummary(line)}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
