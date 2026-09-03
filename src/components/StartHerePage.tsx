import { useEffect, useState } from "react";
import { getMetaRankings, getTopTeams } from "../api";
import type { MetaRankingEntry, TopTeamOut } from "../api";
import AddToTeam from "./AddToTeam";
import PokemonDetailPage from "./PokemonDetailPage";
import "./MetaBrowseViews.css"; // reuses .top-team-* classes for the starter-team cards
import "./StartHerePage.css";

const TOP_POKEMON_COUNT = 6;
const STARTER_TEAM_COUNT = 3;

/** The landing page for someone who's never played Pokemon Champions before.
 *  You said this should work without explanations for now, so it's built
 *  entirely from data we already have: the current best Pokemon (real usage
 *  data) and real winning tournament teams, both one click from "on your
 *  team" via the same AddToTeam control used everywhere else. */
export default function StartHerePage() {
  const [rankings, setRankings] = useState<MetaRankingEntry[] | null>(null);
  const [teams, setTeams] = useState<TopTeamOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailName, setDetailName] = useState<string | null>(null);

  useEffect(() => {
    getMetaRankings()
      .then(setRankings)
      .catch(() => setError("Couldn't reach the backend."));
    getTopTeams()
      .then(setTeams)
      .catch(() => {});
  }, []);

  const topPokemon = (rankings ?? []).slice(0, TOP_POKEMON_COUNT);
  const starterTeams = (teams ?? []).slice(0, STARTER_TEAM_COUNT);

  if (detailName) {
    return <PokemonDetailPage name={detailName} onBack={() => setDetailName(null)} />;
  }

  return (
    <div className="start-here-page">
      <h2>Start Here</h2>
      <p className="subtitle">
        New to Pokemon Champions? This is the current competitive meta in three clicks: the best Pokemon right
        now, a ready-made team you can import and tweak, and where to go next.
      </p>

      {error && <p className="error-banner">{error}</p>}

      <section className="start-here-section">
        <h3>Currently the best Pokemon</h3>
        <p className="start-here-note">Ranked by real tracked usage. Click one to see its full recommended set.</p>
        {!rankings ? (
          <p className="subtitle">Loading...</p>
        ) : (
          <div className="start-here-mon-grid">
            {topPokemon.map((p) => (
              <div className="start-here-mon-card" key={p.name}>
                <button className="start-here-mon-btn" onClick={() => setDetailName(p.name)}>
                  {p.sprite_url && <img src={p.sprite_url} alt="" />}
                  <span className="start-here-mon-rank">#{p.rank}</span>
                  <strong>{p.display_name}</strong>
                  {p.usage_percent != null && <span className="start-here-mon-pct">{p.usage_percent}% usage</span>}
                </button>
                <AddToTeam pokemonName={p.name} label="+ Add" compact />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="start-here-section">
        <h3>Starter teams</h3>
        <p className="start-here-note">
          Real teams that placed highly in tracked tournaments. Import one, then open it in Team Tools to see how
          it holds up and change what you don't like.
        </p>
        {!teams ? (
          <p className="subtitle">Loading...</p>
        ) : starterTeams.length === 0 ? (
          <p className="subtitle">No tournament team data available yet.</p>
        ) : (
          <div className="start-here-team-grid">
            {starterTeams.map((t) => (
              <div className="start-here-team-card" key={`${t.rank}-${t.author}`}>
                <div className="start-here-team-header">
                  <span className="top-team-rank">#{t.rank}</span>
                  <strong>{t.author ?? "Unknown"}</strong>
                  {t.record && <span className="top-team-record">{t.record}</span>}
                </div>
                <div className="top-team-roster">
                  {t.pokemon.map((name, i) => (
                    <span className="top-team-mon" key={name}>
                      {t.sprites[i] && <img src={t.sprites[i] ?? undefined} alt="" />}
                      <span>{name}</span>
                    </span>
                  ))}
                </div>
                <AddToTeam roster={t.slugs} rosterName={`${t.author ?? "Starter"} team`} label="Import this team" compact />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="start-here-section">
        <h3>Where to go next</h3>
        <ul className="start-here-links">
          <li>Built a team already? Open it in <strong>Team Tools</strong> for Speed IQ, matchups, and the Threat Report.</li>
          <li>Want to check a specific matchup? Use the <strong>Damage Calculator</strong> - it can load straight from a saved team.</li>
          <li>Curious about the whole meta? <strong>Pokedex → Meta</strong> has full rankings, top teams and proven cores.</li>
        </ul>
      </section>
    </div>
  );
}
