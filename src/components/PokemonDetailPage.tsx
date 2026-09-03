import { useEffect, useState } from "react";
import { getPokemon, getPokemonUsage, getUsageTrend } from "../api";
import type { PokemonDetail, PokemonUsageOut, UsageTrendPoint } from "../api";
import { TYPE_COLORS } from "../typeColors";
import AddToTeam from "./AddToTeam";
import ChecksAndCounters from "./ChecksAndCounters";
import RecommendedSet from "./RecommendedSet";
import { roleLabel } from "../roleLabel";
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
  const [trend, setTrend] = useState<UsageTrendPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPokemon(null);
    setUsage(null);
    setTrend(null);
    setError(null);
    getPokemon(name)
      .then((p) => !cancelled && setPokemon(p))
      .catch(() => !cancelled && setError("Couldn't load this Pokemon. Is the backend running?"));
    getPokemonUsage(name)
      .then((u) => !cancelled && setUsage(u))
      .catch(() => {});
    getUsageTrend(name)
      .then((t) => !cancelled && setTrend(t))
      .catch(() => !cancelled && setTrend([]));
    return () => {
      cancelled = true;
    };
  }, [name]);

  // Rising/falling: compare the oldest tracked rank we have to the current
  // one. Lower rank number = more used, so a decreasing rank is "rising".
  // We've only been snapshotting since we switched to Smogon, so this stays
  // quiet until a second scrape run gives us something to compare.
  const trendDelta =
    trend && trend.length >= 2 ? trend[0].rank - trend[trend.length - 1].rank : null;

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
            <span className="role-badge">{roleLabel(pokemon, usage)}</span>
          </div>
          <div className="pokemon-detail-add">
            <AddToTeam
              pokemonName={pokemon.name}
              label={usage ? "+ Add to team with its best set" : "+ Add to team"}
            />
          </div>
        </div>
        {usage && (
          <div className="pokemon-detail-usage-badge">
            <span className="usage-badge-label">Meta Rank</span>
            <span className="usage-badge-value">
              #{usage.rank}
              {trendDelta !== null && trendDelta !== 0 && (
                <span
                  className={trendDelta > 0 ? "trend-arrow trend-up" : "trend-arrow trend-down"}
                  title={
                    trendDelta > 0
                      ? `Risen ${trendDelta} rank${trendDelta === 1 ? "" : "s"} since we started tracking`
                      : `Fallen ${Math.abs(trendDelta)} rank${Math.abs(trendDelta) === 1 ? "" : "s"} since we started tracking`
                  }
                >
                  {trendDelta > 0 ? "▲" : "▼"}
                </span>
              )}
            </span>
            {usage.win_rate != null && <span className="usage-badge-sub">{usage.win_rate}% win rate</span>}
            {usage.record && <span className="usage-badge-sub">{usage.record}</span>}
          </div>
        )}
      </div>

      <RecommendedSet pokemonName={pokemon.name} />

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

          {usage && usage.teammates.length > 0 && (
            <>
              <h3>Common Teammates</h3>
              <div className="best-moves-list">
                {usage.teammates.map((t) => (
                  <div className="best-move-row" key={t.name}>
                    {t.sprite_url && <img className="teammate-sprite" src={t.sprite_url} alt="" />}
                    <span className="best-move-name">{t.name}</span>
                    {t.percent != null && <span className="best-move-pct">{t.percent}%</span>}
                    {/* Teammates we can't match to our dex get no button rather
                        than a button that would fail. */}
                    {t.slug && <AddToTeam pokemonName={t.slug} label="+ Add" compact />}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <h3>Checks &amp; Counters</h3>
      <ChecksAndCounters pokemon={pokemon} />
    </div>
  );
}
