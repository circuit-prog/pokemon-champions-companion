import { useEffect, useState } from "react";
import { calcVersus, getMetaPool, getTopTeams, getTopTeamRoster } from "../api";
import type { VersusPair, MetaPoolEntryOut, TeamMatchupMember, TopTeamOut } from "../api";
import type { SavedTeam, TeamSlotData } from "../teamStorage";
import "./MetaCalcsPanel.css";

/** The five ways to ask "how does this matchup go".
 *
 * They're all the same underlying question - some attackers against some
 * defenders - so they share one request and one renderer; the mode only
 * decides what goes on each side and what the picker selects. */
type Mode = "team-vs-1" | "one-vs-team" | "one-vs-meta" | "meta-vs-1" | "team-vs-team";

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
  {
    key: "team-vs-team",
    label: "Team → Team",
    blurb:
      "See how your full team matches up against a real tournament team, using that team's actual " +
      "items, abilities and EV spreads (each Pokemon's own most-used set - Pikalytics doesn't publish " +
      "per-team spreads, only who's on the team).",
    pickerLabel: "Opponent team",
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
  const [topTeams, setTopTeams] = useState<TopTeamOut[]>([]);
  const [opponentRoster, setOpponentRoster] = useState<MetaPoolEntryOut[] | null>(null);
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [targetFilter, setTargetFilter] = useState("");
  const [pairs, setPairs] = useState<VersusPair[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);

  const config = MODES.find((m) => m.key === mode)!;
  // Some modes pick from the ranked meta, some pick from your own team, one
  // picks a real tournament team.
  const picksFromMeta = mode === "team-vs-1" || mode === "one-vs-team";
  const picksFromTopTeams = mode === "team-vs-team";
  // Two modes run against the whole ranked meta, and so need paging.
  const scansMeta = mode === "one-vs-meta" || mode === "meta-vs-1";

  useEffect(() => {
    getMetaPool(0, 60)
      .then((page) => {
        setPool(page.items);
        setPoolTotal(page.total);
      })
      .catch(() => setError("Couldn't load the meta. Is the backend running?"));
    getTopTeams()
      .then(setTopTeams)
      .catch(() => {
        /* Team vs Team just won't have anything to pick if this fails - the
           other four modes don't depend on it. */
      });
  }, []);

  // Reset the selection whenever the mode changes the kind of thing it picks.
  useEffect(() => {
    setShown(PAGE_SIZE);
    setOpponentRoster(null);
    setOpponentName(null);
    if (picksFromMeta) setSelected(pool[0]?.pokemon_name ?? "");
    else if (picksFromTopTeams) setSelected(topTeams[0] ? String(topTeams[0].rank) : "");
    else setSelected(team.slots[0]?.pokemon.name ?? "");
  }, [mode, pool, topTeams, team, picksFromMeta, picksFromTopTeams]);

  // Team vs Team's opponent roster is a separate fetch (each member's real
  // set), so it's loaded on its own rather than blocking the picker.
  useEffect(() => {
    if (!picksFromTopTeams || !selected) return;
    let cancelled = false;
    setOpponentRoster(null);
    getTopTeamRoster(Number(selected))
      .then((result) => {
        if (cancelled) return;
        setOpponentRoster(result.roster);
        setOpponentName(result.author ? `${result.author}'s team (${result.record ?? "?"})` : "that team");
      })
      .catch(() => !cancelled && setError("Couldn't load that team's roster."));
    return () => {
      cancelled = true;
    };
  }, [picksFromTopTeams, selected]);

  useEffect(() => {
    if (!selected) return;
    if (picksFromTopTeams && !opponentRoster) return; // still loading the roster
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
    } else if (mode === "team-vs-team" && opponentRoster) {
      attackers = teamMembers;
      defenders = opponentRoster.map(metaToMember);
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
  }, [mode, selected, team, pool, shown, picksFromTopTeams, opponentRoster]);

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
    : picksFromTopTeams
      ? topTeams.map((t) => ({
          value: String(t.rank),
          label: `#${t.rank} ${t.author ?? "Unknown"} (${t.record ?? "?"})`,
        }))
      : team.slots.map((s) => ({ value: s.pokemon.name, label: s.pokemon.display_name }));

  const filteredOptions = targetFilter.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(targetFilter.trim().toLowerCase()))
    : options;

  // Same reasoning as the "incomplete" warning above, but for the opponent's
  // side: most of a real team's six aren't individually ranked, so they come
  // back with real base stats but no tracked set to build from.
  const opponentGaps = (opponentRoster ?? [])
    .filter((m) => !m.ability && !m.item)
    .map((m) => m.display_name);

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
          <input
            type="text"
            className="calc-target-filter"
            placeholder="Search..."
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
          />
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {filteredOptions.length === 0 && <option value="">No matches</option>}
            {filteredOptions.map((o) => (
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
      {picksFromTopTeams && !opponentRoster && !error && (
        <p className="subtitle">Loading {opponentName ?? "that team"}'s roster...</p>
      )}
      {loading && <p className="subtitle">Running calcs...</p>}

      {incomplete.length > 0 && (
        <div className="calc-warning">
          These numbers use whatever your team currently has set, and some of it is blank:{" "}
          {incomplete.join("; ")}. Fill those in on the Teams page and the calcs will reflect them.
        </div>
      )}

      {opponentGaps.length > 0 && (
        <div className="calc-warning">
          Pikalytics doesn't publish per-team spreads, only rosters - {opponentGaps.join(", ")}{" "}
          {opponentGaps.length === 1 ? "isn't" : "aren't"} individually tracked, so{" "}
          {opponentGaps.length === 1 ? "it's" : "they're"} calculated with a blank set (real base stats,
          no item or ability).
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
