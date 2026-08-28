import { useEffect, useState } from "react";
import { loadTeams } from "../teamStorage";
import type { SavedTeam } from "../teamStorage";
import SpeedIQPanel from "./SpeedIQPanel";
import MetaCalcsPanel from "./MetaCalcsPanel";
import "./TeamToolsPage.css";

type SubTab = "speediq" | "metacalcs";

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
                <button className={subTab === "speediq" ? "active" : ""} onClick={() => setSubTab("speediq")}>
                  SpeedIQ
                </button>
                <button className={subTab === "metacalcs" ? "active" : ""} onClick={() => setSubTab("metacalcs")}>
                  Meta Calcs
                </button>
              </nav>

              {subTab === "speediq" ? <SpeedIQPanel team={team} /> : <MetaCalcsPanel team={team} />}
            </>
          )}
        </>
      )}
    </div>
  );
}
