import { useEffect, useState } from "react";
import PokemonTable from "./PokemonTable";
import MetaRankingsView from "./MetaRankingsView";
import TeamCoresView from "./TeamCoresView";
import TopTeamsView from "./TopTeamsView";
import MovesBrowserView from "./MovesBrowserView";
import AbilitiesBrowserView from "./AbilitiesBrowserView";
import ItemsBrowserView from "./ItemsBrowserView";
import PokemonDetailPage from "./PokemonDetailPage";
import "./DexPage.css";

type SubTab = "all" | "meta" | "cores" | "teams" | "moves" | "abilities" | "items";

const TABS: { key: SubTab; label: string }[] = [
  { key: "all", label: "All Pokemon" },
  { key: "meta", label: "Meta Rankings" },
  { key: "cores", label: "Team Cores" },
  { key: "teams", label: "Top Teams" },
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
  url.searchParams.delete("calc"); // don't mix calculator state into dex links
  if (mon) {
    url.searchParams.set("mon", mon);
  } else {
    url.searchParams.delete("mon");
  }
  if (tab === "all") url.searchParams.delete("dex");
  else url.searchParams.set("dex", tab);
  window.history.replaceState(null, "", url.toString());
}

export default function DexPage() {
  const initial = readUrlState();
  const [subTab, setSubTab] = useState<SubTab>(initial.tab);
  const [detailName, setDetailName] = useState<string | null>(initial.mon);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    writeUrlState(subTab, detailName);
  }, [subTab, detailName]);

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
          <p className="subtitle">
            Browse every Pokemon's stats, or see what's actually winning in Pokemon Champions right now.
          </p>
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
      {subTab === "meta" && <MetaRankingsView onSelectDetail={setDetailName} />}
      {subTab === "cores" && <TeamCoresView />}
      {subTab === "teams" && <TopTeamsView />}
      {subTab === "moves" && <MovesBrowserView />}
      {subTab === "abilities" && <AbilitiesBrowserView />}
      {subTab === "items" && <ItemsBrowserView />}
    </div>
  );
}
