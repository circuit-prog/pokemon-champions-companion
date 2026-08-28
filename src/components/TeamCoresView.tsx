import { useEffect, useState } from "react";
import { getTeamCores } from "../api";
import type { TeamCoreOut } from "../api";
import "./MetaBrowseViews.css";

const SIZES = [
  { value: 0, label: "All" },
  { value: 2, label: "2-Pokemon" },
  { value: 3, label: "3-Pokemon" },
  { value: 4, label: "4-Pokemon" },
];

export default function TeamCoresView() {
  const [size, setSize] = useState(0);
  const [cores, setCores] = useState<TeamCoreOut[] | null>(null);

  useEffect(() => {
    setCores(null);
    getTeamCores(size).then(setCores).catch(() => setCores([]));
  }, [size]);

  return (
    <div className="meta-browse">
      <p className="meta-browse-note">
        Pokemon combinations that show up together most often on real competitive teams. More overlap means a
        stronger established pairing in the current meta.
      </p>

      <nav className="meta-filter-row">
        {SIZES.map((s) => (
          <button
            key={s.value}
            className={size === s.value ? "meta-filter-chip active" : "meta-filter-chip"}
            onClick={() => setSize(s.value)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {!cores && <p className="subtitle">Loading...</p>}
      {cores && cores.length === 0 && <p className="subtitle">No core data available.</p>}

      <div className="core-list">
        {cores?.map((c) => (
          <div className="core-row" key={`${c.size}-${c.rank}`}>
            <span className="core-rank">#{c.rank}</span>
            <span className="core-size-badge">{c.size}-mon</span>
            <div className="core-sprites">
              {c.pokemon.map((name, i) => (
                <span className="core-mon" key={name}>
                  {c.sprites[i] && <img src={c.sprites[i] ?? undefined} alt="" />}
                  <span>{name}</span>
                </span>
              ))}
            </div>
            <div className="core-stats">
              {c.usage_percent != null && <span className="core-usage">{c.usage_percent}%</span>}
              {c.teams != null && <span className="core-teams">{c.teams.toLocaleString()} teams</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
