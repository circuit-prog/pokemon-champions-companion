import { useEffect, useState } from "react";
import { getPokemonTrend, getPokemonStats } from "../api";
import type { TournamentTrendPoint, PokemonStats } from "../api";
import "./StatsPage.css";

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function StatsPage() {
  const [filter, setFilter] = useState("");
  const [trend, setTrend] = useState<TournamentTrendPoint[] | null>(null);
  const [stats, setStats] = useState<PokemonStats | null>(null);

  useEffect(() => {
    if (!filter.trim()) {
      setTrend(null);
      setStats(null);
      return;
    }
    const handle = setTimeout(() => {
      const slug = filter.trim().toLowerCase().replace(/\s+/g, "-");
      getPokemonTrend(slug)
        .then(setTrend)
        .catch(() => setTrend([]));
      getPokemonStats(slug)
        .then(setStats)
        .catch(() => setStats(null));
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

      {stats && (
        <div className="stats-details">
          {stats.appearances === 0 ? (
            <p className="subtitle">No tournament data for that Pokemon yet.</p>
          ) : (
            <>
              <div className="stats-placement-card">
                <div className="stats-placement-item">
                  <div className="stats-placement-value">{stats.appearances}</div>
                  <div className="stats-placement-label">Appearances</div>
                </div>
                <div className="stats-placement-item">
                  <div className="stats-placement-value">#{stats.average_placement}</div>
                  <div className="stats-placement-label">Average finish</div>
                </div>
                <div className="stats-placement-item">
                  <div className="stats-placement-value">#{stats.best_placement}</div>
                  <div className="stats-placement-label" title={stats.best_placement_tournament ?? undefined}>
                    Best finish
                  </div>
                </div>
                <div className="stats-placement-item">
                  <div className="stats-placement-value">{stats.top_4_finishes}</div>
                  <div className="stats-placement-label">Top 4 finishes</div>
                </div>
                <div className="stats-placement-item">
                  <div className="stats-placement-value">{stats.top_8_finishes}</div>
                  <div className="stats-placement-label">Top 8 finishes</div>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stats-section">
                  <div className="stats-section-title">Most used teammates</div>
                  <div className="stats-entry-list">
                    {stats.teammates.map((t) => (
                      <div key={t.pokemon_name} className="stats-entry-row">
                        <img src={t.sprite_url ?? undefined} alt={t.display_name} />
                        <span className="stats-entry-name">{t.display_name}</span>
                        <span className="stats-entry-percent">{t.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stats-section">
                  <div className="stats-section-title">
                    Common counters
                    <span className="stats-section-hint">
                      {" "}
                      - Pokemon on teams that placed above this one in the same tournaments. Approximate: we don't have
                      real head-to-head battle data, just who tended to finish better.
                    </span>
                  </div>
                  <div className="stats-entry-list">
                    {stats.counters.map((t) => (
                      <div key={t.pokemon_name} className="stats-entry-row">
                        <img src={t.sprite_url ?? undefined} alt={t.display_name} />
                        <span className="stats-entry-name">{t.display_name}</span>
                        <span className="stats-entry-percent">{t.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stats-section">
                  <div className="stats-section-title">Most common item</div>
                  <div className="stats-entry-list">
                    {stats.items.map((e) => (
                      <div key={e.name} className="stats-entry-row">
                        <span className="stats-entry-name">{titleCase(e.name)}</span>
                        <span className="stats-entry-percent">{e.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stats-section">
                  <div className="stats-section-title">Most common ability</div>
                  <div className="stats-entry-list">
                    {stats.abilities.map((e) => (
                      <div key={e.name} className="stats-entry-row">
                        <span className="stats-entry-name">{titleCase(e.name)}</span>
                        <span className="stats-entry-percent">{e.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stats-section">
                  <div className="stats-section-title">Most common nature</div>
                  <div className="stats-entry-list">
                    {stats.natures.map((e) => (
                      <div key={e.name} className="stats-entry-row">
                        <span className="stats-entry-name">{titleCase(e.name)}</span>
                        <span className="stats-entry-percent">{e.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="stats-section">
                  <div className="stats-section-title">Most common moves</div>
                  <div className="stats-entry-list">
                    {stats.moves.map((e) => (
                      <div key={e.name} className="stats-entry-row">
                        <span className="stats-entry-name">{titleCase(e.name)}</span>
                        <span className="stats-entry-percent">{e.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
