import { useEffect, useState } from "react";
import { calcDamage } from "../api";
import type { DamageCalcResult } from "../api";
import type { SavedTeam, TeamSlotData } from "../teamStorage";
import TargetPicker from "./TargetPicker";
import type { TargetSpec } from "./TargetPicker";
import "./MetaCalcsPanel.css";

interface MoveResult {
  moveName: string;
  result: DamageCalcResult;
}

function verdictIcon(result: DamageCalcResult): { icon: string; className: string } {
  if (result.error || result.immune) return { icon: "?", className: "verdict-unknown" };
  if (result.ko_text === "Guaranteed OHKO" || result.ko_text === "Possible OHKO") {
    return { icon: "✓", className: "verdict-good" };
  }
  if (result.pct_high != null && result.pct_high >= 50) {
    return { icon: "⚠", className: "verdict-warn" };
  }
  return { icon: "✕", className: "verdict-bad" };
}

function MonVsTargetRow({ slot, target }: { slot: TeamSlotData; target: TargetSpec }) {
  const [results, setResults] = useState<MoveResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const damaging = slot.pokemon.moves.filter((m) => slot.moves.includes(m.name) && m.category !== "status" && m.power);
      const computed: MoveResult[] = [];
      for (const move of damaging) {
        try {
          const result = await calcDamage(
            { pokemon_name: slot.pokemon.name, evs: slot.evs, nature: slot.nature, ability: slot.ability, item: slot.item, level: 50 },
            { pokemon_name: target.pokemon.name, evs: target.evs, nature: target.nature, ability: target.ability, item: target.item, level: 50 },
            move.name
          );
          computed.push({ moveName: move.display_name, result });
        } catch {
          // skip moves that fail to calc (e.g. transient network issue)
        }
      }
      if (!cancelled) setResults(computed);
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.pokemon.name, slot.moves.join(","), slot.evs, slot.nature, slot.ability, slot.item, target.pokemon.name, target.evs, target.nature, target.ability, target.item]);

  return (
    <div className="mon-vs-target-row">
      <div className="mon-vs-target-header">
        {slot.pokemon.sprite_url && <img src={slot.pokemon.sprite_url} alt="" />}
        <span>{slot.pokemon.display_name}</span>
        <span className="vs-label">vs</span>
        {target.pokemon.sprite_url && <img src={target.pokemon.sprite_url} alt="" />}
        <span>{target.pokemon.display_name}</span>
      </div>

      {slot.moves.length === 0 && <div className="mon-vs-target-empty">No moves selected for this Pokemon yet.</div>}

      {results?.map((r, i) => {
        const { icon, className } = verdictIcon(r.result);
        return (
          <div className="move-result-row" key={i}>
            <span className={`verdict-icon ${className}`}>{icon}</span>
            <span className="move-result-name">{r.moveName}</span>
            <span className="move-result-detail">
              {r.result.error
                ? r.result.error
                : r.result.immune
                  ? r.result.reason
                  : `${r.result.dmg_low}-${r.result.dmg_high} (${r.result.pct_low}%-${r.result.pct_high}%) ${r.result.ko_text}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function MetaCalcsPanel({ team }: { team: SavedTeam }) {
  const [target, setTarget] = useState<TargetSpec | null>(null);

  return (
    <div className="metacalcs-panel">
      <TargetPicker label="Meta target" target={target} onChange={setTarget} />

      {target && (
        <div className="mon-vs-target-list">
          {team.slots.map((slot) => (
            <MonVsTargetRow key={slot.pokemon.id} slot={slot} target={target} />
          ))}
        </div>
      )}
    </div>
  );
}
