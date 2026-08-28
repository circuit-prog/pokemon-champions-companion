import { useEffect, useState } from "react";
import { getPokemon, getPokemonUsage } from "../api";
import type { PokemonDetail, PokemonUsageOut } from "../api";
import { TYPE_COLORS } from "../typeColors";
import "./PokemonDetailPage.css";

const STAT_BARS: { key: keyof PokemonDetail; label: string; color: string }[] = [
  { key: "hp", label: "HP", color: "#e74c3c" },
  { key: "attack", label: "Atk", color: "#e59866" },
  { key: "defense", label: "Def", color: "#f4d03f" },
  { key: "special_attack", label: "SpA", color: "#7fb3d5" },
  { key: "special_defense", label: "SpD", color: "#82ca9d" },
  { key: "speed", label: "Spe", color: "#f19cbb" },
];

export default function PokemonDetailPage({ name, onBack }: { name: string; onBack: () => void }) {
  const [pokemon, setPokemon] = useState<PokemonDetail | null>(null);
  const [usage, setUsage] = useState<PokemonUsageOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPokemon(null);
    setUsage(null);
    setError(null);
    getPokemon(name).then(setPokemon).catch(() => setError("Couldn't load this Pokemon. Is the backend running?"));
    getPokemonUsage(name).then(setUsage).catch(() => {});
  }, [name]);

  if (error) {
    return (
      <div className="pokemon-detail-page">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <p className="error-banner">{error}</p>
      </div>
    );
  }

  if (!pokemon) {
    return (
      <div className="pokemon-detail-page">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <p>Loading...</p>
      </div>
    );
  }

  const moveUsageByName = new Map((usage?.moves ?? []).map((m) => [m.name.toLowerCase(), m]));
  const bestMoves = pokemon.moves
    .map((m) => ({ ...m, usagePercent: moveUsageByName.get(m.display_name.toLowerCase())?.percent ?? null }))
    .filter((m) => m.usagePercent != null)
    .sort((a, b) => (b.usagePercent ?? 0) - (a.usagePercent ?? 0));

  const maxStat = Math.max(...STAT_BARS.map((s) => pokemon[s.key] as number), 1);

  return (
    <div className="pokemon-detail-page">
      <button className="back-btn" onClick={onBack}>
        ← Back
      </button>

      <div className="pokemon-detail-header">
        {pokemon.sprite_url && <img src={pokemon.sprite_url} alt={pokemon.display_name} />}
        <div>
          <h2>{pokemon.display_name}</h2>
          <div className="pokemon-detail-types">
            <span className="type-badge" style={{ background: TYPE_COLORS[pokemon.type1] ?? TYPE_COLORS.unknown }}>
              {pokemon.type1}
            </span>
            {pokemon.type2 && (
              <span className="type-badge" style={{ background: TYPE_COLORS[pokemon.type2] ?? TYPE_COLORS.unknown }}>
                {pokemon.type2}
              </span>
            )}
          </div>
        </div>
        {usage && (
          <div className="pokemon-detail-usage-badge">
            <span className="usage-badge-label">Meta Rank</span>
            <span className="usage-badge-value">#{usage.rank}</span>
            {usage.usage_percent != null && <span className="usage-badge-sub">{usage.usage_percent}% usage</span>}
          </div>
        )}
      </div>

      <div className="pokemon-detail-columns">
        <div>
          <h3>Base Stats</h3>
          <div className="stat-chart">
            {STAT_BARS.map((s) => {
              const value = pokemon[s.key] as number;
              return (
                <div className="stat-chart-row" key={s.key}>
                  <span className="stat-chart-label">{s.label}</span>
                  <div className="stat-chart-track">
                    <div
                      className="stat-chart-fill"
                      style={{ width: `${(value / maxStat) * 100}%`, background: s.color }}
                    />
                  </div>
                  <span className="stat-chart-value">{value}</span>
                </div>
              );
            })}
          </div>

          <h3>Abilities</h3>
          <div className="detail-ability-list">
            {pokemon.abilities.map((a) => (
              <div className="detail-ability-row" key={a.id}>
                <strong>{a.display_name}</strong>
                {a.effect && <p>{a.effect}</p>}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>Best Moves {usage ? "(real usage data)" : ""}</h3>
          {bestMoves.length === 0 ? (
            <p className="subtitle">No tracked competitive usage data for this Pokemon yet.</p>
          ) : (
            <div className="best-moves-list">
              {bestMoves.map((m) => (
                <div className="best-move-row" key={m.id}>
                  <span className="type-badge" style={{ background: TYPE_COLORS[m.type] ?? TYPE_COLORS.unknown }}>
                    {m.type}
                  </span>
                  <span className="best-move-name">{m.display_name}</span>
                  <span className="best-move-pct">{m.usagePercent}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
