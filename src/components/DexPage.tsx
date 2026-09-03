import { useEffect, useState } from "react";
import PokemonTable from "./PokemonTable";
import MovesBrowserView from "./MovesBrowserView";
import AbilitiesBrowserView from "./AbilitiesBrowserView";
import ItemsBrowserView from "./ItemsBrowserView";
import PokemonDetailPage from "./PokemonDetailPage";
import "./DexPage.css";

type SubTab = "all" | "moves" | "abilities" | "items";

const TABS: { key: SubTab; label: string }[] = [
  { key: "all", label: "All Pokemon" },
  { key: "moves", label: "Moves" },
  { key: "abilities", label: "Abilities" },
  { key: "items", label: "Items" },
];

/** Keep ?dex= (tab) and ?mon= (detail page) in the URL so any dex view is
 *  shareable, the same way the damage calculator's ?calc= links work. */
function readUrlState(): { tab: SubTab; mon: string | null } {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("dex") as SubTab | null;
  return {
    tab: TABS.some((t) => t.key === tab) ? (tab as SubTab) : "all",
    mon: params.get("mon"),
  };
}

function writeUrlState(tab: SubTab, mon: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete("calc"); // don't mix calculator/meta state into dex links
  url.searchParams.delete("meta");
  if (mon) {
    url.searchParams.set("mon", mon);
  } else {
    url.searchParams.delete("mon");
  }
  if (tab === "all") url.searchParams.delete("dex");
  else url.searchParams.set("dex", tab);
  window.history.replaceState(null, "", url.toString());
}

export default function DexPage({ active = true }: { active?: boolean }) {
  const initial = readUrlState();
  const [subTab, setSubTab] = useState<SubTab>(initial.tab);
  const [detailName, setDetailName] = useState<string | null>(initial.mon);
  const [copied, setCopied] = useState(false);

  // Every top-level page now stays mounted once visited (so switching tabs
  // doesn't reset it), which means an inactive page must not keep writing
  // its own state into the URL - otherwise whichever page mounted last wins
  // the query string regardless of which tab you're actually looking at.
  useEffect(() => {
    if (!active) return;
    writeUrlState(subTab, detailName);
  }, [active, subTab, detailName]);

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  }

  if (detailName) {
    return <PokemonDetailPage name={detailName} onBack={() => setDetailName(null)} />;
  }

  return (
    <div className="dex-page">
      <div className="dex-header">
        <div>
          <h2>Pokedex</h2>
          <p className="subtitle">Browse every Pokemon's stats, moves, abilities and items.</p>
        </div>
        <button className="dex-share-btn" onClick={copyLink}>
          {copied ? "Link copied" : "Copy link to this view"}
        </button>
      </div>

      <nav className="dex-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={subTab === t.key ? "active" : ""}
            onClick={() => setSubTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {subTab === "all" && <PokemonTable onSelectDetail={setDetailName} />}
      {subTab === "moves" && <MovesBrowserView />}
      {subTab === "abilities" && <AbilitiesBrowserView />}
      {subTab === "items" && <ItemsBrowserView />}
    </div>
  );
}
