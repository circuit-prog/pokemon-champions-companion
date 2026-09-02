import { useEffect, useState } from "react";
import { browseAbilities, getAbilityHolders } from "../api";
import type { AbilityOut, PokemonSummary } from "../api";
import "./MovesBrowserView.css";

const PAGE_SIZE = 60;

/** Standalone ability browser: search by name or effect text, and see which
 *  Pokemon can actually have a given ability once you've found it. */
export default function AbilitiesBrowserView() {
  const [query, setQuery] = useState("");
  const [abilities, setAbilities] = useState<AbilityOut[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [holders, setHolders] = useState<Record<string, PokemonSummary[]>>({});
  const [holdersLoading, setHoldersLoading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      browseAbilities(query, PAGE_SIZE)
        .then((page) => {
          if (cancelled) return;
          setAbilities(page.items);
          setTotal(page.total);
        })
        .catch(() => !cancelled && setAbilities([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  function toggleExpand(a: AbilityOut) {
    if (expanded === a.name) {
      setExpanded(null);
      return;
    }
    setExpanded(a.name);
    if (!holders[a.name]) {
      setHoldersLoading(a.name);
      getAbilityHolders(a.name)
        .then((list) => setHolders((prev) => ({ ...prev, [a.name]: list })))
        .catch(() => setHolders((prev) => ({ ...prev, [a.name]: [] })))
        .finally(() => setHoldersLoading(null));
    }
  }

  return (
    <div className="moves-browser">
      <p className="subtitle">
        Search every ability by name or effect. Click one to see which Pokemon can actually have it.
      </p>

      <div className="moves-filters">
        <input
          className="moves-search"
          type="text"
          placeholder="Search abilities by name or effect..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="moves-status">
        {loading
          ? "Searching..."
          : total > 0
            ? `${total} abilit${total === 1 ? "y" : "ies"} match`
            : "No abilities match."}
      </div>

      <div className="moves-list">
        {abilities.map((a) => {
          const open = expanded === a.name;
          return (
            <div key={a.name}>
              <button className={open ? "move-row open" : "move-row"} onClick={() => toggleExpand(a)}>
                <span className="move-row-name">{a.display_name}</span>
                <span className="move-row-chevron">{open ? "▾" : "▸"}</span>
              </button>
              {a.effect && <p className="move-row-effect" style={{ paddingLeft: "0.8rem" }}>{a.effect}</p>}
              {open && (
                <div className="move-learners">
                  {holdersLoading === a.name ? (
                    <p className="subtitle">Loading Pokemon...</p>
                  ) : (holders[a.name]?.length ?? 0) === 0 ? (
                    <p className="subtitle">No Pokemon in the dex can have this ability.</p>
                  ) : (
                    <div className="move-learners-grid">
                      {holders[a.name].map((p) => (
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
