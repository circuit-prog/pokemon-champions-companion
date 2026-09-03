import { useEffect, useState } from "react";
import { loadTeams, updateTeam } from "../teamStorage";
import type { SavedTeam } from "../teamStorage";
import SpeedIQPanel from "./SpeedIQPanel";
import MetaCalcsPanel from "./MetaCalcsPanel";
import TypeMatchupsPanel from "./TypeMatchupsPanel";
import MoveIQPanel from "./MoveIQPanel";
import BreakerPanel from "./BreakerPanel";
import WallerPanel from "./WallerPanel";
import TeamVsTeamPanel from "./TeamVsTeamPanel";
import TeamThreatReportPanel from "./TeamThreatReportPanel";
import "./TeamToolsPage.css";

type SubTab =
  | "speediq"
  | "metacalcs"
  | "typematchups"
  | "moveiq"
  | "breaker"
  | "waller"
  | "teamvsteam"
  | "threatreport";

const TABS: { key: SubTab; label: string }[] = [
  { key: "speediq", label: "SpeedIQ" },
  { key: "metacalcs", label: "Meta Calcs" },
  { key: "typematchups", label: "Type Matchups" },
  { key: "moveiq", label: "MoveIQ" },
  { key: "breaker", label: "Breaker" },
  { key: "waller", label: "Waller" },
  { key: "teamvsteam", label: "Team vs Team" },
  { key: "threatreport", label: "Threat Report" },
];

export default function TeamToolsPage() {
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [teamId, setTeamId] = useState<string>("");
  const [subTab, setSubTab] = useState<SubTab>("speediq");
  // Only ever mount a sub-tab's panel once you've actually opened it, so
  // switching tabs doesn't fire all 8 tools' backend requests up front -
  // but once opened, keep it mounted (hidden via CSS) so it doesn't reset.
  const [visited, setVisited] = useState<Set<SubTab>>(new Set(["speediq"]));

  function openSubTab(next: SubTab) {
    setSubTab(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }

  useEffect(() => {
    const loaded = loadTeams();
    setTeams(loaded);
    if (loaded.length > 0) setTeamId(loaded[0].id);
  }, []);

  const team = teams.find((t) => t.id === teamId) ?? null;

  /** Persist a change a tool made to the team (Move IQ adding a move, say)
   *  and keep the tools rendering the updated version. */
  function applyTeamChange(next: SavedTeam) {
    updateTeam(next);
    setTeams((prev) => prev.map((t) => (t.id === next.id ? next : t)));
  }

  // Every sub-tab stays mounted once visited (hidden via CSS instead of
  // unmounted) so switching between them, e.g. to check Speed IQ then coming
  // back to Breaker, doesn't throw away what was on screen.
  function renderPanels() {
    if (!team) return null;
    return TABS.filter((t) => visited.has(t.key)).map((t) => {
      let panel;
      switch (t.key) {
        case "speediq":
          panel = <SpeedIQPanel team={team} />;
          break;
        case "metacalcs":
          panel = <MetaCalcsPanel team={team} />;
          break;
        case "typematchups":
          panel = <TypeMatchupsPanel team={team} />;
          break;
        case "moveiq":
          panel = <MoveIQPanel team={team} onTeamChange={applyTeamChange} />;
          break;
        case "breaker":
          panel = <BreakerPanel team={team} />;
          break;
        case "waller":
          panel = <WallerPanel team={team} />;
          break;
        case "teamvsteam":
          panel = <TeamVsTeamPanel team={team} />;
          break;
        case "threatreport":
          panel = <TeamThreatReportPanel team={team} />;
          break;
      }
      return (
        <div key={t.key} className={subTab === t.key ? "" : "hidden"}>
          {panel}
        </div>
      );
    });
  }

  return (
    <div className="team-tools-page">
      <h2>Team Tools</h2>

      {teams.length === 0 ? (
        <p className="subtitle">Build a team first (in the Teams tab), then come back here to analyze it.</p>
      ) : (
        <>
          <label className="field team-tools-select">
            Team
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slots.length}/6)
                </option>
              ))}
            </select>
          </label>

          {team && team.slots.length === 0 && <p className="subtitle">This team has no Pokemon yet.</p>}

          {team && team.slots.length > 0 && (
            <>
              <nav className="team-tools-tabs">
                {TABS.map((t) => (
                  <button key={t.key} className={subTab === t.key ? "active" : ""} onClick={() => openSubTab(t.key)}>
                    {t.label}
                  </button>
                ))}
              </nav>

              {renderPanels()}
            </>
          )}
        </>
      )}
    </div>
  );
}
