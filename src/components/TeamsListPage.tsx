import { useEffect, useRef, useState } from "react";
import { loadTeams, createTeam, deleteTeam, duplicateTeam, updateTeam, exportTeamsJson, importTeamsFromJson } from "../teamStorage";
import type { SavedTeam } from "../teamStorage";
import { importShowdownTeam } from "../showdownImport";
import { exportTeamToShowdown } from "../teamExport";
import "./TeamsListPage.css";

const UNCATEGORIZED = "(uncategorized)";

export default function TeamsListPage({ onOpenTeam }: { onOpenTeam: (teamId: string) => void }) {
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [activeFolder, setActiveFolder] = useState<string>("(all)");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  /** Downloads every saved team as one JSON file - teams live in this
   *  browser's localStorage only, so this is how you move them to another
   *  device (paired with handleImportFile below on the receiving end). */
  function handleExportAll() {
    const blob = new Blob([exportTeamsJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pokemon-champions-teams-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setTransferMessage(null);
    file
      .text()
      .then((text) => {
        const { imported, skipped } = importTeamsFromJson(text);
        setTransferMessage(
          imported === 0
            ? "No new teams to import - they're already here."
            : `Imported ${imported} team${imported === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} already present, skipped)` : ""}.`
        );
        refresh();
      })
      .catch(() => setTransferMessage("Couldn't read that file - is it a teams export from this app?"));
  }

  async function handleImport() {
    setImporting(true);
    setImportError(null);
    try {
      const { slots, failed } = await importShowdownTeam(importText);
      if (slots.length === 0) {
        setImportError("Couldn't read any Pokemon from that text. Check it's in Showdown export format.");
        return;
      }
      const team = createTeam("Imported Team");
      updateTeam({ ...team, slots });
      if (failed.length > 0) {
        // Partial success is still worth keeping - just tell them what dropped.
        alert(`Imported ${slots.length} Pokemon. Couldn't find: ${failed.join(", ")}`);
      }
      setImportOpen(false);
      setImportText("");
      onOpenTeam(team.id);
    } catch {
      setImportError("Import failed. Is the backend running?");
    } finally {
      setImporting(false);
    }
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

  function handleRename(team: SavedTeam) {
    const name = prompt("Rename team", team.name);
    if (name == null || !name.trim() || name === team.name) return;
    updateTeam({ ...team, name: name.trim() });
    refresh();
  }

  function handleSetFolder(team: SavedTeam) {
    const folder = prompt(
      "Move to folder (existing or new name, blank for uncategorized)",
      team.folder
    );
    if (folder == null || folder === team.folder) return;
    updateTeam({ ...team, folder: folder.trim() });
    refresh();
  }

  async function handleExport(team: SavedTeam) {
    const text = exportTeamToShowdown(team);
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard in Showdown export format.");
    } catch {
      // Clipboard access can be blocked - fall back to showing it directly.
      prompt("Copy this team (Showdown format):", text);
    }
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
        <div className="teams-actions">
          <button className="new-team-btn" onClick={handleNewTeam}>
            + New Team
          </button>
          <button className="import-team-btn" onClick={() => setImportOpen((o) => !o)}>
            Import from Showdown
          </button>
          <button className="import-team-btn" onClick={handleExportAll} disabled={teams.length === 0}>
            Export all teams
          </button>
          <button className="import-team-btn" onClick={() => fileInputRef.current?.click()}>
            Import teams file
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={handleImportFile}
          />
        </div>
        {transferMessage && <p className="subtitle">{transferMessage}</p>}

        {importOpen && (
          <div className="import-panel">
            <p className="import-hint">
              Paste a team in Pokemon Showdown export format (one Pokemon per block, separated by blank lines).
            </p>
            <textarea
              className="import-textarea"
              rows={10}
              placeholder={"Garchomp @ Life Orb\nAbility: Rough Skin\nEVs: 32 Atk\nAdamant Nature\n- Earthquake\n- Dragon Claw"}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            {importError && <div className="import-error">{importError}</div>}
            <div className="import-actions">
              <button className="new-team-btn" onClick={handleImport} disabled={!importText.trim() || importing}>
                {importing ? "Importing..." : "Import Team"}
              </button>
              <button className="import-cancel-btn" onClick={() => setImportOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

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
                <button onClick={() => handleRename(team)}>Rename</button>
                <button onClick={() => handleSetFolder(team)}>Folder</button>
                <button onClick={() => handleDuplicate(team.id)}>Duplicate</button>
                <button onClick={() => handleExport(team)} disabled={team.slots.length === 0}>
                  Export
                </button>
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
