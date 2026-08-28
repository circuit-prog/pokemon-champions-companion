import { useEffect, useState } from "react";
import { loadTeams, createTeam, deleteTeam, duplicateTeam } from "../teamStorage";
import type { SavedTeam } from "../teamStorage";
import "./TeamsListPage.css";

const UNCATEGORIZED = "(uncategorized)";

export default function TeamsListPage({ onOpenTeam }: { onOpenTeam: (teamId: string) => void }) {
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>("(all)");

  useEffect(() => {
    setTeams(loadTeams());
  }, []);

  function refresh() {
    setTeams(loadTeams());
  }

  function handleNewTeam() {
    const team = createTeam();
    onOpenTeam(team.id);
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this team? This can't be undone.")) return;
    deleteTeam(id);
    refresh();
  }

  function handleDuplicate(id: string) {
    duplicateTeam(id);
    refresh();
  }

  const folders = Array.from(new Set(teams.map((t) => t.folder || UNCATEGORIZED)));
  const visibleTeams = activeFolder === "(all)" ? teams : teams.filter((t) => (t.folder || UNCATEGORIZED) === activeFolder);

  return (
    <div className="teams-list-page">
      <aside className="teams-sidebar">
        <button
          className={activeFolder === "(all)" ? "folder-btn active" : "folder-btn"}
          onClick={() => setActiveFolder("(all)")}
        >
          (all)
        </button>
        {folders.map((f) => (
          <button
            key={f}
            className={activeFolder === f ? "folder-btn active" : "folder-btn"}
            onClick={() => setActiveFolder(f)}
          >
            {f}
          </button>
        ))}
      </aside>

      <main className="teams-main">
        <h2>My Teams ({teams.length})</h2>
        <button className="new-team-btn" onClick={handleNewTeam}>
          + New Team
        </button>

        <div className="teams-grid">
          {visibleTeams.map((team) => (
            <div className="team-card" key={team.id}>
              <button className="team-card-main" onClick={() => onOpenTeam(team.id)}>
                <div className="team-card-sprites">
                  {team.slots.length === 0 && <span className="team-card-empty">Empty team</span>}
                  {team.slots.map((s) => (
                    <img key={s.pokemon.id} src={s.pokemon.sprite_url ?? undefined} alt={s.pokemon.display_name} />
                  ))}
                </div>
                <div className="team-card-name">{team.name}</div>
              </button>
              <div className="team-card-actions">
                <button onClick={() => handleDuplicate(team.id)}>Duplicate</button>
                <button onClick={() => handleDelete(team.id)} className="danger">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
