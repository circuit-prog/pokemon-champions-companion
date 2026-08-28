import { useEffect, useState } from "react";
import { searchPokemon, getPokemon } from "../api";
import type { PokemonSummary, PokemonDetail } from "../api";
import "./TeamBuilder.css";

const TEAM_SIZE = 6;

interface TeamSlot {
  pokemon: PokemonDetail;
  ability: string;
  moves: string[]; // up to 4 move names
}

function PokemonSearch({ onPick }: { onPick: (p: PokemonSummary) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PokemonSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Debounce: wait 250ms after typing stops before hitting the API,
    // so we don't fire a request on every single keystroke.
    const handle = setTimeout(() => {
      setLoading(true);
      searchPokemon(query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="pokemon-search">
      <input
        type="text"
        placeholder="Search Pokemon by name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && <div className="search-status">Searching...</div>}
      <div className="search-results">
        {results.map((p) => (
          <button key={p.id} className="search-result" onClick={() => onPick(p)}>
            {p.sprite_url && <img src={p.sprite_url} alt={p.display_name} />}
            <span>{p.display_name}</span>
            <span className="types">
              {p.type1}
              {p.type2 ? ` / ${p.type2}` : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatBar({ label, value, max = 255 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="stat-bar">
      <span className="stat-label">{label}</span>
      <div className="stat-track">
        <div className="stat-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function TeamSlotCard({
  slot,
  onRemove,
  onChangeAbility,
  onChangeMove,
}: {
  slot: TeamSlot;
  onRemove: () => void;
  onChangeAbility: (ability: string) => void;
  onChangeMove: (index: number, moveName: string) => void;
}) {
  const { pokemon } = slot;
  return (
    <div className="team-slot-card">
      <div className="team-slot-header">
        {pokemon.sprite_url && <img src={pokemon.sprite_url} alt={pokemon.display_name} />}
        <div>
          <h3>{pokemon.display_name}</h3>
          <span className="types">
            {pokemon.type1}
            {pokemon.type2 ? ` / ${pokemon.type2}` : ""}
          </span>
        </div>
        <button className="remove-btn" onClick={onRemove} aria-label="Remove from team">
          ✕
        </button>
      </div>

      <div className="stats">
        <StatBar label="HP" value={pokemon.hp} />
        <StatBar label="Atk" value={pokemon.attack} />
        <StatBar label="Def" value={pokemon.defense} />
        <StatBar label="SpA" value={pokemon.special_attack} />
        <StatBar label="SpD" value={pokemon.special_defense} />
        <StatBar label="Spe" value={pokemon.speed} />
      </div>

      <label className="field">
        Ability
        <select value={slot.ability} onChange={(e) => onChangeAbility(e.target.value)}>
          <option value="">-- choose ability --</option>
          {pokemon.abilities.map((a) => (
            <option key={a.id} value={a.name}>
              {a.display_name}
            </option>
          ))}
        </select>
      </label>

      <div className="moves">
        {[0, 1, 2, 3].map((i) => (
          <label className="field" key={i}>
            Move {i + 1}
            <select value={slot.moves[i] ?? ""} onChange={(e) => onChangeMove(i, e.target.value)}>
              <option value="">-- choose move --</option>
              {pokemon.moves.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function TeamBuilder() {
  const [team, setTeam] = useState<TeamSlot[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function addToTeam(p: PokemonSummary) {
    if (team.length >= TEAM_SIZE) {
      setError(`Your team is full (max ${TEAM_SIZE} Pokemon).`);
      return;
    }
    if (team.some((slot) => slot.pokemon.name === p.name)) {
      setError(`${p.display_name} is already on your team.`);
      return;
    }
    setError(null);
    try {
      const detail = await getPokemon(p.name);
      setTeam((prev) => [...prev, { pokemon: detail, ability: "", moves: [] }]);
    } catch {
      setError(`Couldn't load details for ${p.display_name}. Is the backend running?`);
    }
  }

  function removeFromTeam(index: number) {
    setTeam((prev) => prev.filter((_, i) => i !== index));
  }

  function updateAbility(index: number, ability: string) {
    setTeam((prev) => prev.map((slot, i) => (i === index ? { ...slot, ability } : slot)));
  }

  function updateMove(index: number, moveIndex: number, moveName: string) {
    setTeam((prev) =>
      prev.map((slot, i) => {
        if (i !== index) return slot;
        const moves = [...slot.moves];
        moves[moveIndex] = moveName;
        return { ...slot, moves };
      })
    );
  }

  return (
    <div className="team-builder">
      <h2>Team Builder</h2>
      <p className="subtitle">
        {team.length}/{TEAM_SIZE} Pokemon on your team
      </p>

      {error && <div className="error-banner">{error}</div>}

      <PokemonSearch onPick={addToTeam} />

      <div className="team-grid">
        {team.map((slot, i) => (
          <TeamSlotCard
            key={slot.pokemon.id}
            slot={slot}
            onRemove={() => removeFromTeam(i)}
            onChangeAbility={(a) => updateAbility(i, a)}
            onChangeMove={(mi, m) => updateMove(i, mi, m)}
          />
        ))}
      </div>
    </div>
  );
}
