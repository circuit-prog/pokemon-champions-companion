import { useEffect, useState } from "react";
import { getPokemonTrend, getPokemonStats, getPokemonMovers } from "../api";
import type { TournamentTrendPoint, PokemonStats, PokemonMovers } from "../api";
import "./StatsPage.css";

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

type Bracket = "all" | "top8" | "top4";

function MoversLeaderboard({ onPick }: { onPick: (name: string) => void }) {
  const [movers, setMovers] = useState<PokemonMovers | null>(null);

  useEffect(() => {
    getPokemonMovers(8)
      .then(setMovers)
      .catch(() => setMovers({ risers: [], fallers: [] }));
  }, []);

  if (!movers) return <p className="subtitle">Loading movers...</p>;
  if (movers.risers.length === 0 && movers.fallers.length === 0) {
    return null;
  }

  return (
    <div className="stats-grid stats-movers-grid">
      <div className="stats-section">
        <div className="stats-section-title">Trending up</div>
        <div className="stats-entry-list">
          {movers.risers.map((m) => (
            <button key={m.pokemon_name} className="stats-mover-row" onClick={() => onPick(m.display_name)}>
              <img src={m.sprite_url ?? undefined} alt={m.display_name} />
              <span className="stats-entry-name">{m.display_name}</span>
              <span className="stats-mover-delta stats-mover-up">
                +{m.delta}% ({m.early_usage_percent}% → {m.recent_usage_percent}%)
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="stats-section">
        <div className="stats-section-title">Trending down</div>
        <div className="stats-entry-list">
          {movers.fallers.map((m) => (
            <button key={m.pokemon_name} className="stats-mover-row" onClick={() => onPick(m.display_name)}>
              <img src={m.sprite_url ?? undefined} alt={m.display_name} />
              <span className="stats-entry-name">{m.display_name}</span>
              <span className="stats-mover-delta stats-mover-down">
                {m.delta}% ({m.early_usage_percent}% → {m.recent_usage_percent}%)
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PokemonLookup({
  value,
  onChange,
  placeholder,
  onRemove,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onRemove?: () => void;
}) {
  const [trend, setTrend] = useState<TournamentTrendPoint[] | null>(null);
  const [stats, setStats] = useState<PokemonStats | null>(null);
  const [bracket, setBracket] = useState<Bracket>("all");

  useEffect(() => {
    if (!value.trim()) {
      setTrend(null);
      setStats(null);
      return;
    }
    const handle = setTimeout(() => {
      const slug = slugify(value);
      getPokemonTrend(slug)
        .then(setTrend)
        .catch(() => setTrend([]));
      getPokemonStats(slug, bracket)
        .then(setStats)
        .catch(() => setStats(null));
    }, 300);
    return () => clearTimeout(handle);
  }, [value, bracket]);

  return (
    <div className="stats-lookup">
      <div className="stats-lookup-header">
        <input
          className="tournament-filter-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {onRemove && (
          <button className="stats-lookup-remove" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>

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

              <div className="stats-bracket-toggle">
                <span className="tournaments-facet-label">Sets from</span>
                {(["all", "top8", "top4"] as Bracket[]).map((b) => (
                  <button
                    key={b}
                    className={`facet-chip ${bracket === b ? "active" : ""}`}
                    onClick={() => setBracket(b)}
                  >
                    {b === "all" ? "Whole field" : b === "top8" ? "Top 8 only" : "Top 4 only"}
                  </button>
                ))}
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

export default function StatsPage() {
  const [filter, setFilter] = useState("");
  const [compareFilter, setCompareFilter] = useState<string | null>(null);

  return (
    <div className="stats-page">
      <h2>Stats</h2>
      <p className="subtitle">See how a Pokemon's usage has changed across every tournament we've tracked.</p>

      <MoversLeaderboard onPick={setFilter} />

      <div className={compareFilter !== null ? "stats-compare-grid" : undefined}>
        <PokemonLookup value={filter} onChange={setFilter} placeholder="Look up a Pokemon's usage trend..." />
        {compareFilter !== null ? (
          <PokemonLookup
            value={compareFilter}
            onChange={setCompareFilter}
            placeholder="Compare against another Pokemon..."
            onRemove={() => setCompareFilter(null)}
          />
        ) : (
          filter.trim() && (
            <button className="stats-add-compare" onClick={() => setCompareFilter("")}>
              + Compare another Pokemon
            </button>
          )
        )}
      </div>
    </div>
  );
}
