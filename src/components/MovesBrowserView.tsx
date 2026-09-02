import { useEffect, useState } from "react";
import { browseMoves, getMoveLearners } from "../api";
import type { MoveOut, PokemonSummary } from "../api";
import { ALL_TYPES } from "../typeChart";
import { TYPE_COLORS } from "../typeColors";
import "./MovesBrowserView.css";

const CATEGORIES = ["physical", "special", "status"];
const PAGE_SIZE = 50;

/** Standalone move browser: Showdown-style filtered search across all moves,
 *  not just one Pokemon's learnset, with a reverse lookup showing who
 *  actually learns a move once you've found it. */
export default function MovesBrowserView() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [moves, setMoves] = useState<MoveOut[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [learners, setLearners] = useState<Record<string, PokemonSummary[]>>({});
  const [learnersLoading, setLearnersLoading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      browseMoves({ search: query, type: type || undefined, category: category || undefined, limit: PAGE_SIZE })
        .then((page) => {
          if (cancelled) return;
          setMoves(page.items);
          setTotal(page.total);
        })
        .catch(() => {
          if (!cancelled) setMoves([]);
        })
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, type, category]);

  function toggleExpand(move: MoveOut) {
    if (expanded === move.name) {
      setExpanded(null);
      return;
    }
    setExpanded(move.name);
    if (!learners[move.name]) {
      setLearnersLoading(move.name);
      getMoveLearners(move.name)
        .then((list) => setLearners((prev) => ({ ...prev, [move.name]: list })))
        .catch(() => setLearners((prev) => ({ ...prev, [move.name]: [] })))
        .finally(() => setLearnersLoading(null));
    }
  }

  return (
    <div className="moves-browser">
      <p className="subtitle">
        Search every move by name or effect, filter by type, category, or power - the same
        Showdown-style search Pokemon Showdown offers, but across the whole movedex rather than one
        Pokemon's learnset. Click a move to see who actually learns it.
      </p>

      <div className="moves-filters">
        <input
          className="moves-search"
          type="text"
          placeholder="Search moves by name or effect..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Any type</option>
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Any category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="moves-status">
        {loading ? "Searching..." : total > 0 ? `${total} move${total === 1 ? "" : "s"} match` : "No moves match."}
      </div>

      <div className="moves-list">
        {moves.map((m) => {
          const open = expanded === m.name;
          return (
            <div key={m.name}>
              <button className={open ? "move-row open" : "move-row"} onClick={() => toggleExpand(m)}>
                <span className="type-badge" style={{ background: TYPE_COLORS[m.type] ?? TYPE_COLORS.unknown }}>
                  {m.type}
                </span>
                <span className="move-row-category">{m.category}</span>
                <span className="move-row-name">{m.display_name}</span>
                <span className="move-row-power">{m.power != null ? `${m.power} BP` : "—"}</span>
                <span className="move-row-acc">{m.accuracy != null ? `${m.accuracy}% acc` : "—"}</span>
                <span className="move-row-chevron">{open ? "▾" : "▸"}</span>
              </button>
              {m.effect && <p className="move-row-effect">{m.effect}</p>}
              {open && (
                <div className="move-learners">
                  {learnersLoading === m.name ? (
                    <p className="subtitle">Loading Pokemon...</p>
                  ) : (learners[m.name]?.length ?? 0) === 0 ? (
                    <p className="subtitle">No Pokemon in the dex learn this move.</p>
                  ) : (
                    <div className="move-learners-grid">
                      {learners[m.name].map((p) => (
                        <div className="move-learner-chip" key={p.name}>
                          {p.sprite_url && <img src={p.sprite_url} alt="" />}
                          <span>{p.display_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
