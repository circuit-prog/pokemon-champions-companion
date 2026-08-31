import { useEffect, useState } from "react";
import { browsePokemon } from "../api";
import type { PokemonSummary } from "../api";
import { TYPE_COLORS } from "../typeColors";
import AddToTeam from "./AddToTeam";
import "./PokemonTable.css";

// "usage" preserves the order the backend returned (real meta usage rank
// first, then everyone else) rather than re-sorting client-side.
type SortKey = "usage" | "name" | "hp" | "attack" | "defense" | "special_attack" | "special_defense" | "speed" | "bst";

function bst(p: PokemonSummary): number {
  return p.hp + p.attack + p.defense + p.special_attack + p.special_defense + p.speed;
}

// How many rows to fetch at a time. The dex is 1351 Pokemon, so we page
// rather than sending the lot, but sorting and searching now happen on the
// server so every one of them is reachable.
const PAGE_SIZE = 100;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "usage", label: "Usage" },
  { key: "name", label: "Name" },
  { key: "hp", label: "HP" },
  { key: "attack", label: "Atk" },
  { key: "defense", label: "Def" },
  { key: "special_attack", label: "SpA" },
  { key: "special_defense", label: "SpD" },
  { key: "speed", label: "Spe" },
  { key: "bst", label: "BST" },
];

export default function PokemonTable({
  onPick,
  onSelectDetail,
}: {
  onPick?: (p: PokemonSummary) => void;
  onSelectDetail?: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PokemonSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("usage");
  const [sortDesc, setSortDesc] = useState(false);

  // Sorting and searching are server-side, so changing either re-queries from
  // the start. Sorting in the browser used to reorder only the rows already
  // fetched, which meant a Pokemon outside the first page could never be found
  // by sorting on a stat no matter what you did.
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      browsePokemon({
        search: query,
        sort: sortKey,
        order: sortDesc ? "desc" : "asc",
        limit: PAGE_SIZE,
        offset: 0,
      })
        .then((page) => {
          if (cancelled) return;
          setResults(page.items);
          setTotal(page.total);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setTotal(0);
          setError("Couldn't reach the Pokedex. Is the backend running?");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, sortKey, sortDesc]);

  function loadMore() {
    setLoadingMore(true);
    browsePokemon({
      search: query,
      sort: sortKey,
      order: sortDesc ? "desc" : "asc",
      limit: PAGE_SIZE,
      offset: results.length,
    })
      .then((page) => setResults((prev) => [...prev, ...page.items]))
      .catch(() => setError("Couldn't load more results."))
      .finally(() => setLoadingMore(false));
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      // Stats read best highest-first; name and usage rank ascending.
      setSortDesc(key !== "name" && key !== "usage");
    }
  }

  const displayed = results;

  return (
    <div className="pokemon-table-wrap">
      <input
        className="pokemon-table-search"
        type="text"
        placeholder="Search Pokemon by name..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <div className="error-banner">{error}</div>}
      <div className="search-status">
        {loading
          ? "Searching..."
          : total > 0
            ? `Showing ${displayed.length} of ${total} Pokemon`
            : "No Pokemon match that search."}
      </div>
      <div className="pokemon-table-scroll">
        <table className="pokemon-table">
          <thead>
            <tr>
              {/* Sprite column doubles as the "Usage" (meta rank order) sort header. */}
              <th onClick={() => toggleSort("usage")} className="sortable">
                Usage
                {sortKey === "usage" ? (sortDesc ? " ▼" : " ▲") : ""}
              </th>
              {COLUMNS.filter((c) => c.key !== "usage").map((c) => (
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
            {displayed.map((p) => (
              <tr key={p.id}>
                <td>{p.sprite_url && <img className="pokemon-table-sprite" src={p.sprite_url} alt="" />}</td>
                <td className="pokemon-table-name">
                  {onSelectDetail ? (
                    <button className="pokemon-table-name-btn" onClick={() => onSelectDetail(p.name)}>
                      {p.display_name}
                    </button>
                  ) : (
                    p.display_name
                  )}
                </td>
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
                  {onPick ? (
                    // Inside the team editor: add straight to the team being edited.
                    <button className="pokemon-table-add" onClick={() => onPick(p)}>
                      + Add
                    </button>
                  ) : (
                    // Browsing the Pokedex: let the user choose which team.
                    <AddToTeam pokemonName={p.name} label="+ Add" compact />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {displayed.length < total && (
        <button className="load-more-btn" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading..." : `Load more (${total - displayed.length} remaining)`}
        </button>
      )}
    </div>
  );
}
