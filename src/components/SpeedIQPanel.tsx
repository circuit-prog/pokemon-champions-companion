import { useState } from "react";
import type { SavedTeam } from "../teamStorage";
import { statAtLevel } from "../statCalc";
import TargetPicker from "./TargetPicker";
import type { TargetSpec } from "./TargetPicker";
import "./SpeedIQPanel.css";

export default function SpeedIQPanel({ team }: { team: SavedTeam }) {
  const [target, setTarget] = useState<TargetSpec | null>(null);

  const teamSpeeds = team.slots
    .map((slot) => ({
      name: slot.pokemon.display_name,
      sprite: slot.pokemon.sprite_url,
      speed: statAtLevel(slot.pokemon.speed, slot.evs.spe, 50, "spe", slot.nature),
    }))
    .sort((a, b) => b.speed - a.speed);

  const targetSpeed = target ? statAtLevel(target.pokemon.speed, target.evs.spe, 50, "spe", target.nature) : null;

  return (
    <div className="speediq-panel">
      <div className="speediq-columns">
        <div>
          <h3>Your team's speed tiers</h3>
          <div className="speed-list">
            {teamSpeeds.map((s) => (
              <div className="speed-row" key={s.name}>
                {s.sprite && <img src={s.sprite} alt="" />}
                <span className="speed-row-name">{s.name}</span>
                <span className="speed-row-value">{s.speed}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>Compare against a meta target</h3>
          <TargetPicker label="Target Pokemon" target={target} onChange={setTarget} />
        </div>
      </div>

      {target && targetSpeed != null && (
        <div className="speed-comparison">
          <h3>
            Vs {target.pokemon.display_name} ({targetSpeed} Speed)
          </h3>
          {teamSpeeds.map((s) => {
            const outspeeds = s.speed > targetSpeed;
            const tie = s.speed === targetSpeed;
            return (
              <div className="speed-comparison-row" key={s.name}>
                {s.sprite && <img src={s.sprite} alt="" />}
                <span className="speed-row-name">{s.name}</span>
                <span className="speed-row-value">{s.speed}</span>
                <span className={tie ? "speed-badge tie" : outspeeds ? "speed-badge fast" : "speed-badge slow"}>
                  {tie ? "Speed tie" : outspeeds ? "Outspeeds" : "Outsped by"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
