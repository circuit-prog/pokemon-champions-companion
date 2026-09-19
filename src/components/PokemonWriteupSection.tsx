import { useEffect, useState } from "react";
import { getPokemonWriteup, savePokemonWriteup, deletePokemonWriteup } from "../api";
import type { PokemonWriteup, PokemonWriteupIn } from "../api";
import "./PokemonWriteupSection.css";

const SECTIONS: { key: keyof PokemonWriteupIn; label: string; placeholder: string }[] = [
  { key: "overview", label: "Overview", placeholder: "What makes this Pokemon good right now, and its role on a team..." },
  { key: "moveset_notes", label: "Moveset & Set Notes", placeholder: "Why this ability/item/nature/EV spread/moves, and notable alternatives..." },
  { key: "usage_tips", label: "Usage Tips", placeholder: "How to actually play it - when to bring it in, sequencing, common lines..." },
  { key: "checks_and_counters", label: "Checks & Counters", placeholder: "What beats it, and how to play around those threats..." },
];

/** A hand-written Smogon-style meta analysis for one Pokemon - Phase 5.
 *  Shown read-only when a writeup exists; always offers an edit toggle
 *  since this is a single-user app with no auth to gate it behind. */
export default function PokemonWriteupSection({ pokemonName }: { pokemonName: string }) {
  const [writeup, setWriteup] = useState<PokemonWriteup | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PokemonWriteupIn>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoaded(false);
    setEditing(false);
    setWriteup(null);
    getPokemonWriteup(pokemonName)
      .then((w) => {
        setWriteup(w);
        setDraft(w);
      })
      .catch(() => setWriteup(null))
      .finally(() => setLoaded(true));
  }, [pokemonName]);

  function startEditing() {
    setDraft(writeup ?? {});
    setEditing(true);
    setError(null);
  }

  function handleSave() {
    const hasContent = SECTIONS.some((s) => (draft[s.key] ?? "").trim());
    if (!hasContent) {
      setError("Write something in at least one section before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    savePokemonWriteup(pokemonName, draft)
      .then((w) => {
        setWriteup(w);
        setEditing(false);
      })
      .catch(() => setError("Couldn't save. Is the backend running?"))
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    if (!confirm("Delete this writeup? This can't be undone.")) return;
    deletePokemonWriteup(pokemonName)
      .then(() => {
        setWriteup(null);
        setEditing(false);
      })
      .catch(() => setError("Couldn't delete."));
  }

  if (!loaded) return null;

  if (!writeup && !editing) {
    return (
      <div className="pokemon-writeup-section pokemon-writeup-empty">
        <p className="subtitle">No meta analysis written for this Pokemon yet.</p>
        <button onClick={startEditing}>+ Write analysis</button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="pokemon-writeup-section">
        <h3>Meta Analysis</h3>
        {error && <p className="error-banner">{error}</p>}
        {SECTIONS.map((s) => (
          <div key={s.key} className="pokemon-writeup-field">
            <label className="tournaments-facet-label">{s.label}</label>
            <textarea
              className="practice-textarea"
              rows={4}
              placeholder={s.placeholder}
              value={draft[s.key] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
            />
          </div>
        ))}
        <div className="practice-actions">
          <button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button onClick={() => setEditing(false)}>Cancel</button>
          {writeup && (
            <button className="danger" onClick={handleDelete}>
              Delete
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pokemon-writeup-section">
      <div className="pokemon-writeup-header">
        <h3>Meta Analysis</h3>
        <button onClick={startEditing}>Edit</button>
      </div>
      {SECTIONS.map((s) =>
        writeup![s.key] ? (
          <div key={s.key} className="pokemon-writeup-field">
            <h4>{s.label}</h4>
            <p className="pokemon-writeup-text">{writeup![s.key]}</p>
          </div>
        ) : null
      )}
    </div>
  );
}
