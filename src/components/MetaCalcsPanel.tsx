import { useEffect, useState } from "react";
import { calcVersus, getMetaPool } from "../api";
import type { VersusPair, MetaPoolEntryOut, TeamMatchupMember } from "../api";
import type { SavedTeam, TeamSlotData } from "../teamStorage";
import "./MetaCalcsPanel.css";

/** The four ways to ask "how does this matchup go".
 *
 * They're all the same underlying question - some attackers against some
 * defenders - so they share one request and one renderer; the mode only
 * decides what goes on each side and what the picker selects. */
type Mode = "team-vs-1" | "one-vs-team" | "one-vs-meta" | "meta-vs-1";

const MODES: { key: Mode; label: string; blurb: string; pickerLabel: string }[] = [
  {
    key: "team-vs-1",
    label: "Team → 1",
    blurb: "See how your full team attacks one selected meta target.",
    pickerLabel: "Meta target",
  },
  {
    key: "one-vs-team",
    label: "1 → Team",
    blurb: "See how one selected meta attacker pressures your full team.",
    pickerLabel: "Meta attacker",
  },
  {
    key: "one-vs-meta",
    label: "1 → Meta",
    blurb: "See how one team member attacks the ranked meta.",
    pickerLabel: "Attacker",
  },
  {
    key: "meta-vs-1",
    label: "Meta → 1",
    blurb: "See how the ranked meta attacks one of your Pokemon.",
    pickerLabel: "Defender",
  },
];

const PAGE_SIZE = 20;

/** A team slot as the calc endpoint wants it. */
function slotToMember(slot: TeamSlotData): TeamMatchupMember {
  return {
    pokemon_name: slot.pokemon.name,
    evs: slot.evs,
    nature: slot.nature,
    ability: slot.ability,
    item: slot.item,
    level: 50,
    moves: slot.moves,
  };
}

/** A meta Pokemon as the calc endpoint wants it, running its most-used set. */
function metaToMember(entry: MetaPoolEntryOut): TeamMatchupMember {
  return {
    pokemon_name: entry.pokemon_name,
    evs: entry.evs,
    nature: entry.nature,
    ability: entry.ability,
    item: entry.item,
    level: 50,
    moves: entry.moves,
  };
}

function VerdictIcon({ verdict }: { verdict: "good" | "warning" | "bad" }) {
  const glyph = verdict === "good" ? "✓" : verdict === "warning" ? "⚠" : "✗";
  return (
    <span className={`calc-verdict ${verdict}`} aria-hidden="true">
      {glyph}
    </span>
  );
}

function SideCard({ side }: { side: VersusPair["attacker"] }) {
  // Spell out the set each number came from. Abilities and items move damage
  // a long way but never appeared anywhere, so there was no way to tell an
  // applied ability from an empty one.
  const parts = [side.ability, side.item].filter(Boolean);
  return (
    <div className={side.moves_first ? "calc-side first" : "calc-side"}>
      {side.sprite_url && <img src={side.sprite_url} alt="" />}
      <div className="calc-side-text">
        <strong>{side.display_name}</strong>
        <span className="calc-side-speed">
          {side.speed} Speed
          {side.moves_first && <span className="moves-first-badge">▶▶ Moves first</span>}
        </span>
        <span className="calc-side-set">
          {side.spread}
          {parts.length > 0 && ` · ${parts.join(" · ")}`}
          {side.missing.length > 0 && (
            <span className="calc-side-missing"> · no {side.missing.join(", ")}</span>
          )}
        </span>
      </div>
    </div>
  );
}

function PairCard({ pair }: { pair: VersusPair }) {
  return (
    <div className="calc-pair">
      <div className="calc-pair-header">
        <SideCard side={pair.attacker} />
        <span className="calc-vs">vs</span>
        <SideCard side={pair.defender} />
      </div>

      {pair.results.length === 0 ? (
        <p className="calc-empty">
          No damaging moves selected on {pair.attacker.display_name}.
        </p>
      ) : (
        <div className="calc-lines">
          {pair.results.map((r) => (
            <div className="calc-line" key={r.move_name}>
              <VerdictIcon verdict={r.verdict} />
              <div className="calc-line-body">
                <span className="calc-desc">
                  {r.description}
                  {r.ko_text ? ` -- ${r.ko_text.toLowerCase()}` : ""}
                </span>
                {r.ko_text && <span className="calc-ko">{r.ko_text.toUpperCase()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MetaCalcsPanel({ team }: { team: SavedTeam }) {
  const [mode, setMode] = useState<Mode>("team-vs-1");
  const [pool, setPool] = useState<MetaPoolEntryOut[]>([]);
  const [poolTotal, setPoolTotal] = useState(0);
  const [selected, setSelected] = useState<string>("");
  const [pairs, setPairs] = useState<VersusPair[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);

  const config = MODES.find((m) => m.key === mode)!;
  // Two modes pick from the meta, two pick from your own team.
  const picksFromMeta = mode === "team-vs-1" || mode === "one-vs-team";
  // Two modes run against the whole ranked meta, and so need paging.
  const scansMeta = mode === "one-vs-meta" || mode === "meta-vs-1";

  useEffect(() => {
    getMetaPool(0, 60)
      .then((page) => {
        setPool(page.items);
        setPoolTotal(page.total);
      })
      .catch(() => setError("Couldn't load the meta. Is the backend running?"));
  }, []);

  // Reset the selection whenever the mode changes the kind of thing it picks.
  useEffect(() => {
    setShown(PAGE_SIZE);
    if (picksFromMeta) setSelected(pool[0]?.pokemon_name ?? "");
    else setSelected(team.slots[0]?.pokemon.name ?? "");
  }, [mode, pool, team, picksFromMeta]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const teamMembers = team.slots.map(slotToMember);
    const metaMember = pool.find((p) => p.pokemon_name === selected);
    const teamMember = team.slots.find((s) => s.pokemon.name === selected);

    let attackers: TeamMatchupMember[] = [];
    let defenders: TeamMatchupMember[] = [];

    if (mode === "team-vs-1" && metaMember) {
      attackers = teamMembers;
      defenders = [metaToMember(metaMember)];
    } else if (mode === "one-vs-team" && metaMember) {
      attackers = [metaToMember(metaMember)];
      defenders = teamMembers;
    } else if (mode === "one-vs-meta" && teamMember) {
      attackers = [slotToMember(teamMember)];
      defenders = pool.slice(0, shown).map(metaToMember);
    } else if (mode === "meta-vs-1" && teamMember) {
      attackers = pool.slice(0, shown).map(metaToMember);
      defenders = [slotToMember(teamMember)];
    }

    if (attackers.length === 0 || defenders.length === 0) {
      setPairs([]);
      setLoading(false);
      return;
    }

    calcVersus(attackers, defenders)
      .then((result) => !cancelled && setPairs(result))
      .catch(() => !cancelled && setError("Couldn't run those calcs."))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [mode, selected, team, pool, shown]);

  if (team.slots.length === 0) {
    return <p className="subtitle">Add some Pokemon to your team first.</p>;
  }

  // Blank fields aren't ignored by the calculator - they're genuinely empty,
  // and the resulting numbers are lower than they will be in a real battle.
  const incomplete = team.slots
    .map((slot) => {
      const gaps: string[] = [];
      if (!slot.ability) gaps.push("no ability");
      if (!slot.item) gaps.push("no item");
      if (!Object.values(slot.evs).some((v) => v > 0)) gaps.push("no EVs");
      if (gaps.length === 0) return null;
      const list =
        gaps.length === 1
          ? gaps[0]
          : `${gaps.slice(0, -1).join(", ")} and ${gaps[gaps.length - 1]}`;
      return `${slot.pokemon.display_name} has ${list}`;
    })
    .filter((x): x is string => x !== null);

  const options = picksFromMeta
    ? pool.map((p) => ({ value: p.pokemon_name, label: `#${p.rank} ${p.display_name}` }))
    : team.slots.map((s) => ({ value: s.pokemon.name, label: s.pokemon.display_name }));

  return (
    <div className="meta-calcs-panel">
      <div className="calc-toolbar">
        <span className="calc-toolbar-label">Mode</span>
        <div className="calc-modes">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={m.key === mode ? "calc-mode active" : "calc-mode"}
              onClick={() => setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <label className="calc-picker">
          <span className="calc-toolbar-label">{config.pickerLabel}</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="calc-blurb">
        {config.blurb}
        {scansMeta && ` Loaded ${Math.min(shown, poolTotal)} at a time.`}
      </p>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="subtitle">Running calcs...</p>}

      {incomplete.length > 0 && (
        <div className="calc-warning">
          These numbers use whatever your team currently has set, and some of it is blank:{" "}
          {incomplete.join("; ")}. Fill those in on the Teams page and the calcs will reflect them.
        </div>
      )}

      {pairs && pairs.length > 0 && (
        <div className="calc-pairs">
          {pairs.map((p, i) => (
            <PairCard key={`${p.attacker.pokemon_name}-${p.defender.pokemon_name}-${i}`} pair={p} />
          ))}
        </div>
      )}

      {scansMeta && pool.length > 0 && (
        <div className="calc-footer">
          <span className="subtitle">
            Showing {Math.min(shown, pool.length)} of {poolTotal} ranked targets
          </span>
          {shown < pool.length && (
            <button className="load-more-btn" onClick={() => setShown((s) => s + PAGE_SIZE)}>
              Load {PAGE_SIZE} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
