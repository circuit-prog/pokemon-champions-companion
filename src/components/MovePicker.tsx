import { useState } from "react";
import type { MoveOut, PokemonUsageOut } from "../api";
import { TYPE_COLORS } from "../typeColors";
import "./MovePicker.css";

interface MoveWithUsage extends MoveOut {
  usagePercent: number | null;
}

function buildMoveList(moves: MoveOut[], usage: PokemonUsageOut | null): MoveWithUsage[] {
  const usageByName = new Map((usage?.moves ?? []).map((m) => [m.name.toLowerCase(), m.percent]));
  const withUsage = moves.map((m) => ({ ...m, usagePercent: usageByName.get(m.display_name.toLowerCase()) ?? null }));
  return withUsage.sort((a, b) => {
    if (a.usagePercent != null && b.usagePercent != null) return b.usagePercent - a.usagePercent;
    if (a.usagePercent != null) return -1;
    if (b.usagePercent != null) return 1;
    return a.display_name.localeCompare(b.display_name);
  });
}

function matchesQuery(m: MoveWithUsage, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    m.display_name.toLowerCase().includes(q) ||
    m.type.toLowerCase().includes(q) ||
    m.category.toLowerCase().includes(q) ||
    (m.effect ?? "").toLowerCase().includes(q)
  );
}

const CATEGORY_LABEL: Record<string, string> = { physical: "PHY", special: "SPE", status: "STA" };
const CATEGORY_COLOR: Record<string, string> = { physical: "#c0392b", special: "#2980b9", status: "#7f8c8d" };

export default function MovePicker({
  moves,
  usage,
  selected,
  onToggle,
  maxSelected = 4,
}: {
  moves: MoveOut[];
  usage: PokemonUsageOut | null;
  selected: string[];
  onToggle: (moveName: string) => void;
  maxSelected?: number;
}) {
  const [query, setQuery] = useState("");
  const list = buildMoveList(moves, usage).filter((m) => matchesQuery(m, query));
  const isFull = selected.length >= maxSelected;

  return (
    <div className="move-picker">
      <div className="move-picker-header">
        Moves
        <span className="move-picker-count">
          {selected.length}/{maxSelected} selected
        </span>
      </div>
      <input
        className="move-picker-search"
        type="text"
        placeholder="Search moves by name, type, category, or effect..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="move-picker-list">
        {list.length === 0 && <div className="move-picker-empty">No moves match "{query}".</div>}
        {list.map((m) => {
          const isSelected = selected.includes(m.name);
          return (
            <div className="move-row" key={m.id}>
              <div className="move-row-main">
                <span className="type-badge" style={{ background: TYPE_COLORS[m.type] ?? TYPE_COLORS.unknown }}>
                  {m.type}
                </span>
                <span
                  className="category-badge"
                  style={{ borderColor: CATEGORY_COLOR[m.category], color: CATEGORY_COLOR[m.category] }}
                  title={m.category}
                >
                  {CATEGORY_LABEL[m.category] ?? m.category.slice(0, 3).toUpperCase()}
                </span>
                <span className="move-row-name">{m.display_name}</span>
                {m.usagePercent != null && <span className="move-row-usage">{m.usagePercent}%</span>}
                <button
                  className={isSelected ? "move-toggle-btn selected" : "move-toggle-btn"}
                  disabled={!isSelected && isFull}
                  onClick={() => onToggle(m.name)}
                  aria-label={isSelected ? `Remove ${m.display_name}` : `Add ${m.display_name}`}
                >
                  {isSelected ? "✕" : "+"}
                </button>
              </div>
              <div className="move-row-meta">
                <span>Power {m.power ?? "--"}</span>
                <span>Accuracy {m.accuracy != null ? `${m.accuracy}%` : "--"}</span>
                <span>PP {m.pp ?? "--"}</span>
              </div>
              {m.effect && <div className="move-row-desc">{m.effect}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
