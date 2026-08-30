import { useEffect, useState } from "react";
import { loadTeams, updateTeam } from "../teamStorage";
import type { SavedTeam } from "../teamStorage";
import SpeedIQPanel from "./SpeedIQPanel";
import MetaCalcsPanel from "./MetaCalcsPanel";
import TypeMatchupsPanel from "./TypeMatchupsPanel";
import MoveIQPanel from "./MoveIQPanel";
import BreakerPanel from "./BreakerPanel";
import WallerPanel from "./WallerPanel";
import "./TeamToolsPage.css";

type SubTab = "speediq" | "metacalcs" | "typematchups" | "moveiq" | "breaker" | "waller";

const TABS: { key: SubTab; label: string }[] = [
  { key: "speediq", label: "SpeedIQ" },
  { key: "metacalcs", label: "Meta Calcs" },
  { key: "typematchups", label: "Type Matchups" },
  { key: "moveiq", label: "MoveIQ" },
  { key: "breaker", label: "Breaker" },
  { key: "waller", label: "Waller" },
];

export default function TeamToolsPage() {
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [teamId, setTeamId] = useState<string>("");
  const [subTab, setSubTab] = useState<SubTab>("speediq");

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

  function renderPanel() {
    if (!team) return null;
    switch (subTab) {
      case "speediq":
        return <SpeedIQPanel team={team} />;
      case "metacalcs":
        return <MetaCalcsPanel team={team} />;
      case "typematchups":
        return <TypeMatchupsPanel team={team} />;
      case "moveiq":
        return <MoveIQPanel team={team} onTeamChange={applyTeamChange} />;
      case "breaker":
        return <BreakerPanel team={team} />;
      case "waller":
        return <WallerPanel team={team} />;
    }
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
                  <button key={t.key} className={subTab === t.key ? "active" : ""} onClick={() => setSubTab(t.key)}>
                    {t.label}
                  </button>
                ))}
              </nav>

              {renderPanel()}
            </>
          )}
        </>
      )}
    </div>
  );
}
