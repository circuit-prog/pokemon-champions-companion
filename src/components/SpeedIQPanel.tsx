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
  oppMaxSpeed: boolean;
  paralysis: boolean;
  scarf: boolean;
}

const TOGGLES: { key: keyof Field; label: string; hint: string }[] = [
  { key: "tailwind", label: "Tailwind", hint: "Doubles your team's Speed" },
  { key: "oppTailwind", label: "Opp. Tailwind", hint: "Doubles the meta's Speed" },
  { key: "trickRoom", label: "Trick Room", hint: "Slower Pokemon move first" },
  { key: "maxSpeed", label: "Your max Speed", hint: "Assume your team invests fully in Speed" },
  {
    key: "oppMaxSpeed",
    label: "Their max Speed",
    hint: "Worst case: assume every meta Pokemon runs 32 Speed EVs and a boosting nature",
  },
  { key: "scarf", label: "Choice Scarf", hint: "1.5x your team's Speed" },
  { key: "paralysis", label: "Paralysed", hint: "Halves your team's Speed" },
];

const EMPTY_FIELD: Field = {
  tailwind: false,
  oppTailwind: false,
  trickRoom: false,
  maxSpeed: false,
  oppMaxSpeed: false,
  scarf: false,
  paralysis: false,
};

// A Speed-boosting nature, for the "assume they're fully invested" case.
const MAX_SPEED_NATURE = "jolly";

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
  /** Slowest common spread's speed, when it differs - a Pokemon that can be
   *  either fast or bulky isn't one number. */
  slowSpeed?: number;
}

// How much of the ranked meta to ladder against. Speed ties are decided by
// exact numbers, so seeing deep into the list is genuinely useful.
const POOL_SIZE = 150;

// Spreads below this usage are noise, and letting them set the "fastest"
// figure would make every Pokemon look like a Choice Scarf sweeper.
const MIN_SPREAD_USAGE = 3;

export default function SpeedIQPanel({ team }: { team: SavedTeam }) {
  const [field, setField] = useState<Field>(EMPTY_FIELD);
  const [pool, setPool] = useState<MetaPoolEntryOut[]>([]);
  const [poolTotal, setPoolTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMetaPool(0, POOL_SIZE)
      .then((page) => {
        setPool(page.items);
        setPoolTotal(page.total);
      })
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

  // For "can I outrun this", the useful assumption is the fastest spread
  // people actually run, not the single most-used one: Charizard-Mega-Y's
  // top spread is a bulky 125 Speed, but 5.6% of them are 152 and those are
  // the ones that beat you. We show that figure and note the slower variant.
  const theirs: Entry[] = pool.map((entry) => {
    const candidates = (entry.spreads ?? []).filter(
      (sp) => (sp.percent ?? 0) >= MIN_SPREAD_USAGE
    );
    const usable = candidates.length > 0
      ? candidates
      : [{ nature: entry.nature, evs: entry.evs, percent: null }];

    // "Their max Speed" ignores what people actually run and asks the
    // worst-case question instead: could this Pokemon outrun me if it were
    // built for it? That's the safe assumption when you can't scout.
    const speeds = field.oppMaxSpeed
      ? [statAtLevel(entry.base_speed, MAX_EV_PER_STAT, 50, "spe", MAX_SPEED_NATURE)]
      : usable.map((sp) =>
          statAtLevel(entry.base_speed, sp.evs.spe ?? 0, 50, "spe", sp.nature)
        );
    const fastest = Math.max(...speeds);
    const slowest = Math.min(...speeds);

    return {
      key: `meta-${entry.pokemon_name}`,
      name: entry.display_name,
      sprite: entry.sprite_url,
      speed: applyField(fastest, field, false),
      slowSpeed: slowest !== fastest ? applyField(slowest, field, false) : undefined,
      mine: false,
      rank: entry.rank,
    };
  });

  const ladder = [...mine, ...theirs].sort((a, b) =>
    field.trickRoom ? a.speed - b.speed : b.speed - a.speed
  );

  const slowestMine = Math.min(...mine.map((m) => m.speed));
  const fastestMine = Math.max(...mine.map((m) => m.speed));

  return (
    <div className="speediq-panel">
      <p className="subtitle">
        Where your team sits in the speed order against the top {pool.length} of {poolTotal} ranked
        Pokemon.{" "}
        {field.oppMaxSpeed ? (
          <>
            Every meta Pokemon is shown at <strong>maximum Speed</strong> (32 EVs, boosting nature) —
            the worst case, whether or not anyone actually builds it that way.
          </>
        ) : (
          <>
            Each shows the <strong>fastest spread people actually run</strong> (at least{" "}
            {MIN_SPREAD_USAGE}% usage), because that's the one that outruns you; where a slower
            common spread exists it's shown alongside.
          </>
        )}
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
              {e.slowSpeed !== undefined && (
                <span className="speed-rung-alt"> · slower spread {e.slowSpeed}</span>
              )}
            </span>
            {e.mine && <span className="speed-rung-tag">Yours</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
