import { useEffect, useState } from "react";
import { getMetaPool } from "../api";
import type { MetaPoolEntryOut } from "../api";
import type { SavedTeam } from "../teamStorage";
import { statAtLevel } from "../statCalc";
import { MAX_EV_PER_STAT } from "../natures";
import "./SpeedIQPanel.css";

/** Field conditions that change who moves first.
 *
 * Speed in isolation says very little - the question is always "do I outrun
 * this under the conditions I'll actually be in", and Tailwind or Trick Room
 * invert the answer entirely. */
interface Field {
  tailwind: boolean;
  oppTailwind: boolean;
  trickRoom: boolean;
  maxSpeed: boolean;
  paralysis: boolean;
  scarf: boolean;
}

const TOGGLES: { key: keyof Field; label: string; hint: string }[] = [
  { key: "tailwind", label: "Tailwind", hint: "Doubles your team's Speed" },
  { key: "oppTailwind", label: "Opp. Tailwind", hint: "Doubles the meta's Speed" },
  { key: "trickRoom", label: "Trick Room", hint: "Slower Pokemon move first" },
  { key: "maxSpeed", label: "Max Speed", hint: "Assume your team invests fully in Speed" },
  { key: "scarf", label: "Choice Scarf", hint: "1.5x your team's Speed" },
  { key: "paralysis", label: "Paralysed", hint: "Halves your team's Speed" },
];

const EMPTY_FIELD: Field = {
  tailwind: false,
  oppTailwind: false,
  trickRoom: false,
  maxSpeed: false,
  scarf: false,
  paralysis: false,
};

function applyField(base: number, field: Field, ours: boolean): number {
  let speed = base;
  if (ours) {
    if (field.tailwind) speed *= 2;
    if (field.scarf) speed = Math.floor(speed * 1.5);
    if (field.paralysis) speed = Math.floor(speed / 2);
  } else if (field.oppTailwind) {
    speed *= 2;
  }
  return Math.floor(speed);
}

interface Entry {
  key: string;
  name: string;
  sprite: string | null;
  speed: number;
  mine: boolean;
  rank?: number;
}

export default function SpeedIQPanel({ team }: { team: SavedTeam }) {
  const [field, setField] = useState<Field>(EMPTY_FIELD);
  const [pool, setPool] = useState<MetaPoolEntryOut[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMetaPool(0, 40)
      .then((page) => setPool(page.items))
      .catch(() => setError("Couldn't load the meta. Is the backend running?"));
  }, []);

  if (team.slots.length === 0) {
    return <p className="subtitle">Add some Pokemon to your team first.</p>;
  }

  const mine: Entry[] = team.slots.map((slot) => {
    const evs = field.maxSpeed ? MAX_EV_PER_STAT : slot.evs.spe;
    return {
      key: `mine-${slot.pokemon.name}`,
      name: slot.pokemon.display_name,
      sprite: slot.pokemon.sprite_url,
      speed: applyField(statAtLevel(slot.pokemon.speed, evs, 50, "spe", slot.nature), field, true),
      mine: true,
    };
  });

  // Meta Pokemon run their real most-used spread and nature, so these are the
  // speeds you will actually be racing rather than neutral guesses.
  const theirs: Entry[] = pool.map((entry) => ({
    key: `meta-${entry.pokemon_name}`,
    name: entry.display_name,
    sprite: entry.sprite_url,
    speed: applyField(
      statAtLevel(entry.base_speed, entry.evs.spe ?? 0, 50, "spe", entry.nature),
      field,
      false
    ),
    mine: false,
    rank: entry.rank,
  }));

  const ladder = [...mine, ...theirs].sort((a, b) =>
    field.trickRoom ? a.speed - b.speed : b.speed - a.speed
  );

  const slowestMine = Math.min(...mine.map((m) => m.speed));
  const fastestMine = Math.max(...mine.map((m) => m.speed));

  return (
    <div className="speediq-panel">
      <p className="subtitle">
        Where your team sits in the speed order, under whatever conditions you expect to be in.
        {field.trickRoom && " Trick Room is on, so slowest moves first."}
      </p>

      <div className="speed-field">
        <span className="speed-field-label">Field</span>
        {TOGGLES.map((t) => (
          <label key={t.key} className="speed-toggle" title={t.hint}>
            <input
              type="checkbox"
              checked={field[t.key]}
              onChange={(e) => setField((f) => ({ ...f, [t.key]: e.target.checked }))}
            />
            {t.label}
          </label>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="speed-summary">
        Your fastest is <strong>{fastestMine}</strong>, your slowest <strong>{slowestMine}</strong>.
      </div>

      <div className="speed-ladder">
        {ladder.map((e) => (
          <div className={e.mine ? "speed-rung mine" : "speed-rung"} key={e.key}>
            <span className="speed-rung-value">{e.speed}</span>
            {e.sprite && <img src={e.sprite} alt="" />}
            <span className="speed-rung-name">
              {e.name}
              {e.rank ? <span className="speed-rung-rank"> #{e.rank}</span> : null}
            </span>
            {e.mine && <span className="speed-rung-tag">Yours</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
