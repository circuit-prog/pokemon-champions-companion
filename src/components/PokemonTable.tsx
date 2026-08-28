import { useEffect, useState } from "react";
import { searchPokemon } from "../api";
import type { PokemonSummary } from "../api";
import { TYPE_COLORS } from "../typeColors";
import "./PokemonTable.css";

type SortKey = "name" | "hp" | "attack" | "defense" | "special_attack" | "special_defense" | "speed" | "bst";

function bst(p: PokemonSummary): number {
  return p.hp + p.attack + p.defense + p.special_attack + p.special_defense + p.speed;
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "hp", label: "HP" },
  { key: "attack", label: "Atk" },
  { key: "defense", label: "Def" },
  { key: "special_attack", label: "SpA" },
  { key: "special_defense", label: "SpD" },
  { key: "speed", label: "Spe" },
  { key: "bst", label: "BST" },
];

export default function PokemonTable({ onPick }: { onPick?: (p: PokemonSummary) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PokemonSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDesc, setSortDesc] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      setLoading(true);
      // With no search text, show a large browsable page instead of the tiny default limit.
      searchPokemon(query)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      setSortDesc(key !== "name"); // stats default to descending (highest first), name to ascending
    }
  }

  const sorted = [...results].sort((a, b) => {
    let cmp: number;
    if (sortKey === "name") cmp = a.display_name.localeCompare(b.display_name);
    else if (sortKey === "bst") cmp = bst(a) - bst(b);
    else cmp = a[sortKey] - b[sortKey];
    return sortDesc ? -cmp : cmp;
  });

  return (
    <div className="pokemon-table-wrap">
      <input
        className="pokemon-table-search"
        type="text"
        placeholder="Search Pokemon by name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && <div className="search-status">Searching...</div>}
      <div className="pokemon-table-scroll">
        <table className="pokemon-table">
          <thead>
            <tr>
              <th />
              {COLUMNS.map((c) => (
                <th key={c.key} onClick={() => toggleSort(c.key)} className="sortable">
                  {c.label}
                  {sortKey === c.key ? (sortDesc ? " ▼" : " ▲") : ""}
                </th>
              ))}
              <th>Types</th>
              <th>Abilities</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td>{p.sprite_url && <img className="pokemon-table-sprite" src={p.sprite_url} alt="" />}</td>
                <td className="pokemon-table-name">{p.display_name}</td>
                <td>{p.hp}</td>
                <td>{p.attack}</td>
                <td>{p.defense}</td>
                <td>{p.special_attack}</td>
                <td>{p.special_defense}</td>
                <td>{p.speed}</td>
                <td className="pokemon-table-bst">{bst(p)}</td>
                <td>
                  <span className="type-badge" style={{ background: TYPE_COLORS[p.type1] ?? TYPE_COLORS.unknown }}>
                    {p.type1}
                  </span>
                  {p.type2 && (
                    <span className="type-badge" style={{ background: TYPE_COLORS[p.type2] ?? TYPE_COLORS.unknown }}>
                      {p.type2}
                    </span>
                  )}
                </td>
                <td className="pokemon-table-abilities">{p.abilities.join(", ")}</td>
                <td>
                  {onPick && (
                    <button className="pokemon-table-add" onClick={() => onPick(p)}>
                      + Add
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
