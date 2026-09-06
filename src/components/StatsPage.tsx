import { useEffect, useState } from "react";
import { getPokemonTrend } from "../api";
import type { TournamentTrendPoint } from "../api";
import "./StatsPage.css";

export default function StatsPage() {
  const [filter, setFilter] = useState("");
  const [trend, setTrend] = useState<TournamentTrendPoint[] | null>(null);

  useEffect(() => {
    if (!filter.trim()) {
      setTrend(null);
      return;
    }
    const handle = setTimeout(() => {
      const slug = filter.trim().toLowerCase().replace(/\s+/g, "-");
      getPokemonTrend(slug)
        .then(setTrend)
        .catch(() => setTrend([]));
    }, 300);
    return () => clearTimeout(handle);
  }, [filter]);

  return (
    <div className="stats-page">
      <h2>Stats</h2>
      <p className="subtitle">See how a Pokemon's usage has changed across every tournament we've tracked.</p>

      <input
        className="tournament-filter-input"
        placeholder="Look up a Pokemon's usage trend..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {trend && (
        <div className="tournament-trend">
          {trend.length === 0 ? (
            <p className="subtitle">No tournament data for that Pokemon yet.</p>
          ) : (
            <>
              <div className="tournament-trend-title">Usage trend over time</div>
              <div className="tournament-trend-bars">
                {trend.map((p) => (
                  <div
                    key={p.tournament_id}
                    className="tournament-trend-bar-row"
                    title={`${p.tournament_name} (${p.tournament_date}): ${p.count}/${p.total_results} teams`}
                  >
                    <span className="tournament-trend-date">{p.tournament_date}</span>
                    <div className="tournament-trend-bar-track">
                      <div className="tournament-trend-bar-fill" style={{ width: `${Math.max(p.usage_percent, 1)}%` }} />
                    </div>
                    <span className="tournament-trend-percent">{p.usage_percent}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
