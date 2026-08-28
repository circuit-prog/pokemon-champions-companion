import { useState } from "react";
import type { AbilityOut } from "../api";
import "./MovePicker.css";

export default function AbilityPicker({
  abilities,
  selected,
  onSelect,
}: {
  abilities: AbilityOut[];
  selected: string;
  onSelect: (abilityName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? abilities.filter(
        (a) => a.display_name.toLowerCase().includes(q) || (a.effect ?? "").toLowerCase().includes(q)
      )
    : abilities;

  return (
    <div className="move-picker">
      <div className="move-picker-header">Ability</div>
      <input
        className="move-picker-search"
        type="text"
        placeholder="Search abilities by name or effect..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="move-picker-list">
        {filtered.length === 0 && <div className="move-picker-empty">No abilities match "{query}".</div>}
        {filtered.map((a) => {
          const isSelected = a.name === selected;
          return (
            <div className="move-row" key={a.id}>
              <div className="move-row-main">
                <span className="move-row-name">{a.display_name}</span>
                <button
                  className={isSelected ? "move-toggle-btn selected" : "move-toggle-btn"}
                  onClick={() => onSelect(isSelected ? "" : a.name)}
                  aria-label={isSelected ? `Deselect ${a.display_name}` : `Select ${a.display_name}`}
                >
                  {isSelected ? "✕" : "+"}
                </button>
              </div>
              {a.effect && <div className="move-row-desc">{a.effect}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
