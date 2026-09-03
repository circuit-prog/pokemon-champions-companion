import { useEffect, useState } from "react";
import MetaRankingsView from "./MetaRankingsView";
import TeamCoresView from "./TeamCoresView";
import TopTeamsView from "./TopTeamsView";
import PokemonDetailPage from "./PokemonDetailPage";
import "./DexPage.css"; // reuses .dex-* layout classes

type SubTab = "rankings" | "cores" | "teams";

const TABS: { key: SubTab; label: string }[] = [
  { key: "rankings", label: "Meta Rankings" },
  { key: "cores", label: "Team Cores" },
  { key: "teams", label: "Top Teams" },
];

/** Rankings, Cores and Top Teams used to live as sub-tabs of "Pokedex", a
 *  page named after a stat encyclopedia - but they're the whole competitive
 *  dataset, not dex trivia, so they get their own top-level tab. */
function readUrlState(): { tab: SubTab; mon: string | null } {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("meta") as SubTab | null;
  return {
    tab: TABS.some((t) => t.key === tab) ? (tab as SubTab) : "rankings",
    mon: params.get("mon"),
  };
}

function writeUrlState(tab: SubTab, mon: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.delete("dex"); // don't mix dex/calculator state into meta links
  url.searchParams.delete("calc");
  if (mon) url.searchParams.set("mon", mon);
  else url.searchParams.delete("mon");
  url.searchParams.set("meta", tab);
  window.history.replaceState(null, "", url.toString());
}

export default function MetaPage({ active = true }: { active?: boolean }) {
  const initial = readUrlState();
  const [subTab, setSubTab] = useState<SubTab>(initial.tab);
  const [detailName, setDetailName] = useState<string | null>(initial.mon);

  // Every top-level page now stays mounted once visited, so an inactive
  // page must not keep writing its own state into the URL - see the same
  // guard in DexPage.
  useEffect(() => {
    if (!active) return;
    writeUrlState(subTab, detailName);
  }, [active, subTab, detailName]);

  if (detailName) {
    return <PokemonDetailPage name={detailName} onBack={() => setDetailName(null)} />;
  }

  return (
    <div className="dex-page">
      <div className="dex-header">
        <div>
          <h2>Meta</h2>
          <p className="subtitle">The competitive picture: what's ranked, what's winning together, and who's winning tournaments.</p>
        </div>
      </div>

      <nav className="dex-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={subTab === t.key ? "active" : ""} onClick={() => setSubTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      {subTab === "rankings" && <MetaRankingsView onSelectDetail={setDetailName} />}
      {subTab === "cores" && <TeamCoresView />}
      {subTab === "teams" && <TopTeamsView />}
    </div>
  );
}
