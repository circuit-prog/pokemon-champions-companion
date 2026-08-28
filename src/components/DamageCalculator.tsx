import { useEffect, useState } from "react";
import { searchPokemon, getPokemon, calcDamage } from "../api";
import type { PokemonSummary, PokemonDetail, DamageCalcResult } from "../api";
import "./DamageCalculator.css";

const NATURES = [
  "hardy", "lonely", "brave", "adamant", "naughty", "bold", "docile", "relaxed",
  "impish", "lax", "timid", "hasty", "serious", "jolly", "naive", "modest",
  "mild", "quiet", "bashful", "rash", "calm", "gentle", "sassy", "careful", "quirky",
];

interface Side {
  pokemon: PokemonDetail | null;
  atkOrSpaEv: number; // whichever offensive/defensive stat matters, kept simple for now
  defOrSpdEv: number;
  hpEv: number;
  nature: string;
}

function PokemonPicker({
  label,
  onPick,
}: {
  label: string;
  onPick: (p: PokemonSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PokemonSummary[]>([]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (!query) {
        setResults([]);
        return;
      }
      searchPokemon(query).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="picker">
      <label>{label}</label>
      <input
        type="text"
        placeholder="Search Pokemon..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.length > 0 && (
        <div className="picker-results">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onPick(p);
                setQuery(p.display_name);
                setResults([]);
              }}
            >
              {p.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DamageCalculator() {
  const [attacker, setAttacker] = useState<Side>({ pokemon: null, atkOrSpaEv: 252, defOrSpdEv: 0, hpEv: 0, nature: "adamant" });
  const [defender, setDefender] = useState<Side>({ pokemon: null, atkOrSpaEv: 0, defOrSpdEv: 252, hpEv: 252, nature: "bold" });
  const [moveName, setMoveName] = useState("");
  const [result, setResult] = useState<DamageCalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pickAttacker(p: PokemonSummary) {
    const detail = await getPokemon(p.name);
    setAttacker((s) => ({ ...s, pokemon: detail }));
    setMoveName("");
  }

  async function pickDefender(p: PokemonSummary) {
    const detail = await getPokemon(p.name);
    setDefender((s) => ({ ...s, pokemon: detail }));
  }

  const damagingMoves = (attacker.pokemon?.moves ?? []).filter(
    (m) => m.category !== "status" && m.power
  );

  async function runCalc() {
    setError(null);
    setResult(null);
    if (!attacker.pokemon || !defender.pokemon || !moveName) {
      setError("Pick an attacker, a defender, and a move first.");
      return;
    }
    const move = damagingMoves.find((m) => m.name === moveName);
    const category = move?.category;
    const atkKey = category === "special" ? "spa" : "atk";
    const defKey = category === "special" ? "spd" : "def";

    try {
      const res = await calcDamage(
        {
          pokemon_name: attacker.pokemon.name,
          evs: { [atkKey]: attacker.atkOrSpaEv, hp: attacker.hpEv },
          nature: attacker.nature,
          level: 50,
        },
        {
          pokemon_name: defender.pokemon.name,
          evs: { [defKey]: defender.defOrSpdEv, hp: defender.hpEv },
          nature: defender.nature,
          level: 50,
        },
        moveName
      );
      setResult(res);
    } catch {
      setError("Calculation failed. Is the backend running?");
    }
  }

  return (
    <div className="damage-calculator">
      <h2>Damage Calculator</h2>
      <div className="calc-columns">
        <div className="calc-side">
          <PokemonPicker label="Attacker" onPick={pickAttacker} />
          {attacker.pokemon && (
            <>
              <label>
                Nature
                <select value={attacker.nature} onChange={(e) => setAttacker((s) => ({ ...s, nature: e.target.value }))}>
                  {NATURES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Offensive EV (0-252)
                <input
                  type="number" min={0} max={252}
                  value={attacker.atkOrSpaEv}
                  onChange={(e) => setAttacker((s) => ({ ...s, atkOrSpaEv: Number(e.target.value) }))}
                />
              </label>
              <label>
                Move
                <select value={moveName} onChange={(e) => setMoveName(e.target.value)}>
                  <option value="">-- choose move --</option>
                  {damagingMoves.map((m) => (
                    <option key={m.id} value={m.name}>{m.display_name} ({m.power})</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>

        <div className="calc-side">
          <PokemonPicker label="Defender" onPick={pickDefender} />
          {defender.pokemon && (
            <>
              <label>
                Nature
                <select value={defender.nature} onChange={(e) => setDefender((s) => ({ ...s, nature: e.target.value }))}>
                  {NATURES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Defensive EV (0-252)
                <input
                  type="number" min={0} max={252}
                  value={defender.defOrSpdEv}
                  onChange={(e) => setDefender((s) => ({ ...s, defOrSpdEv: Number(e.target.value) }))}
                />
              </label>
              <label>
                HP EV (0-252)
                <input
                  type="number" min={0} max={252}
                  value={defender.hpEv}
                  onChange={(e) => setDefender((s) => ({ ...s, hpEv: Number(e.target.value) }))}
                />
              </label>
            </>
          )}
        </div>
      </div>

      <button className="calc-run-btn" onClick={runCalc}>Calculate</button>

      {error && <div className="calc-error">{error}</div>}

      {result && !result.error && !result.immune && (
        <div className="calc-result">
          <p>
            {result.dmg_low}-{result.dmg_high} damage ({result.pct_low}% - {result.pct_high}%)
          </p>
          <p className="ko-text">{result.ko_text}</p>
          <p className="calc-meta">
            Type effectiveness: {result.type_effectiveness}x · STAB: {result.stab}x
          </p>
        </div>
      )}
      {result?.immune && <div className="calc-result">{result.reason}</div>}
      {result?.error && <div className="calc-error">{result.error}</div>}
    </div>
  );
}
