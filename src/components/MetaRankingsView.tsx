import { useEffect, useState } from "react";
import { getMetaRankings, getDataFreshness } from "../api";
import type { MetaRankingEntry, DataFreshness } from "../api";
import { TYPE_COLORS } from "../typeColors";
import "./MetaRankingsView.css";

function formatFreshness(iso: string): string {
  const then = new Date(iso);
  const diffMs = Date.now() - then.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default function MetaRankingsView({ onSelectDetail }: { onSelectDetail: (name: string) => void }) {
  const [rankings, setRankings] = useState<MetaRankingEntry[] | null>(null);
  const [freshness, setFreshness] = useState<DataFreshness | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMetaRankings()
      .then(setRankings)
      .catch(() => setError("Couldn't reach the backend."));
    getDataFreshness().then(setFreshness).catch(() => setFreshness(null));
  }, []);

  if (error) return <p className="error-banner">{error}</p>;
  if (!rankings) return <p className="subtitle">Loading...</p>;
  if (rankings.length === 0) return <p className="subtitle">No usage data available yet.</p>;

  const top20 = rankings.slice(0, 20);

  return (
    <div className="meta-rankings-view">
      <p className="meta-rankings-note">
        Real Pokemon Champions Regulation M-B ranked battle data from Smogon's published stats
        ({rankings.length} Pokemon tracked), with usage percentages and real EV spreads. Win rates,
        where shown, come from Pikalytics.
      </p>
      {freshness?.last_updated && (
        <p className="meta-freshness">
          Meta data as of {formatFreshness(freshness.last_updated)}
          {" "}({new Date(freshness.last_updated).toLocaleDateString()})
        </p>
      )}

      <h3>Top {top20.length} Pokemon</h3>
      <div className="top-grid">
        {top20.map((r) => (
          <button className="top-grid-cell" key={r.name} onClick={() => onSelectDetail(r.name)}>
            <span className="top-grid-rank">{r.rank}</span>
            {r.sprite_url && <img src={r.sprite_url} alt="" />}
            <span className="top-grid-name">{r.display_name}</span>
          </button>
        ))}
      </div>

      <h3>Full Ranking</h3>
      <div className="ranking-list">
        {rankings.map((r) => (
          <button className="ranking-row" key={r.name} onClick={() => onSelectDetail(r.name)}>
            <span className="ranking-rank">#{r.rank}</span>
            {r.sprite_url && <img src={r.sprite_url} alt="" />}
            <span className="ranking-name">{r.display_name}</span>
            <span className="type-badge" style={{ background: TYPE_COLORS[r.type1] ?? TYPE_COLORS.unknown }}>
              {r.type1}
            </span>
            {r.type2 && (
              <span className="type-badge" style={{ background: TYPE_COLORS[r.type2] ?? TYPE_COLORS.unknown }}>
                {r.type2}
              </span>
            )}
            {/* Usage is the headline number - it's what "top 25 meta" means -
                so it leads, with win rate after it where we have one. */}
            {r.usage_percent != null && <span className="ranking-usage">{r.usage_percent}% usage</span>}
            {r.win_rate != null && (
              <span className="ranking-winrate">{r.win_rate.toFixed(1)}% win rate</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
