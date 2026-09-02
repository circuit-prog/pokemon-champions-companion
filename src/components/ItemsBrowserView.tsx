import { useEffect, useState } from "react";
import { browseItems } from "../api";
import type { ItemOut } from "../api";
import "./MovesBrowserView.css";

const PAGE_SIZE = 60;

/** Standalone item browser: search the full itemdex by name or effect text.
 *  No reverse lookup here - unlike moves and abilities, items aren't tied to
 *  a Pokemon in our dex data, only to what a set actually holds. */
export default function ItemsBrowserView() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ItemOut[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      browseItems(query, PAGE_SIZE)
        .then((page) => {
          if (cancelled) return;
          setItems(page.items);
          setTotal(page.total);
        })
        .catch(() => !cancelled && setItems([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  return (
    <div className="moves-browser">
      <p className="subtitle">Search every held item by name or effect - Berries, plates, Choice items, and more.</p>

      <div className="moves-filters">
        <input
          className="moves-search"
          type="text"
          placeholder="Search items by name or effect..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="moves-status">
        {loading ? "Searching..." : total > 0 ? `${total} item${total === 1 ? "" : "s"} match` : "No items match."}
      </div>

      <div className="items-grid">
        {items.map((it) => (
          <div className="item-card" key={it.name}>
            {it.sprite_url && <img src={it.sprite_url} alt="" />}
            <div>
              <div className="item-card-name">{it.display_name}</div>
              {it.effect && <div className="item-card-effect">{it.effect}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
