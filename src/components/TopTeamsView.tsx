import { useEffect, useState } from "react";
import { getTopTeams } from "../api";
import type { TopTeamOut } from "../api";
import AddToTeam from "./AddToTeam";
import "./MetaBrowseViews.css";

export default function TopTeamsView() {
  const [filter, setFilter] = useState("");
  const [teams, setTeams] = useState<TopTeamOut[] | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setTeams(null);
      getTopTeams(filter).then(setTeams).catch(() => setTeams([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [filter]);

  return (
    <div className="meta-browse">
      <p className="meta-browse-note">
        Recent high-placing teams from tracked Pokemon Champions tournaments.
      </p>

      <input
        className="meta-filter-input"
        type="text"
        placeholder="Filter by a Pokemon on the team..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {!teams && <p className="subtitle">Loading...</p>}
      {teams && teams.length === 0 && (
        <p className="subtitle">
          {filter ? `No tracked teams feature "${filter}".` : "No team data available."}
        </p>
      )}

      <div className="top-team-list">
        {teams?.map((t) => (
          <div className="top-team-card" key={`${t.rank}-${t.author}`}>
            <div className="top-team-header">
              <span className="top-team-rank">#{t.rank}</span>
              <strong>{t.author ?? "Unknown"}</strong>
              {t.record && <span className="top-team-record">{t.record}</span>}
            </div>
            {t.tournament && <div className="top-team-tournament">{t.tournament}</div>}
            <div className="top-team-roster">
              {t.pokemon.map((name, i) => (
                <span className="top-team-mon" key={name}>
                  {t.sprites[i] && <img src={t.sprites[i] ?? undefined} alt="" />}
                  <span>{name}</span>
                </span>
              ))}
            </div>
            <div className="top-team-actions">
              <AddToTeam
                roster={t.slugs}
                rosterName={`${t.author ?? "Tournament"} team`}
                label="Import this team"
                compact
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
