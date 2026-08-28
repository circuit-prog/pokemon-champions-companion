import { useState } from "react";
import PokemonTable from "./PokemonTable";
import MetaRankingsView from "./MetaRankingsView";
import PokemonDetailPage from "./PokemonDetailPage";

type SubTab = "all" | "meta";

export default function DexPage() {
  const [subTab, setSubTab] = useState<SubTab>("all");
  const [detailName, setDetailName] = useState<string | null>(null);

  if (detailName) {
    return <PokemonDetailPage name={detailName} onBack={() => setDetailName(null)} />;
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem", textAlign: "left" }}>
      <h2>Pokedex</h2>
      <p style={{ color: "#666", marginTop: "-0.5rem" }}>
        Browse every Pokemon's stats, or see what's actually winning in Pokemon Champions right now.
      </p>

      <nav style={{ display: "flex", gap: "0.4rem", borderBottom: "1px solid #e5e5e5", marginBottom: "1.25rem" }}>
        <button
          onClick={() => setSubTab("all")}
          style={{
            padding: "0.4rem 0.9rem", border: "none",
            borderBottom: subTab === "all" ? "3px solid #4a90e2" : "3px solid transparent",
            background: "none", cursor: "pointer", fontSize: "0.88rem",
            color: subTab === "all" ? "#2a5cb8" : "#666", fontWeight: subTab === "all" ? 600 : 400,
          }}
        >
          All Pokemon
        </button>
        <button
          onClick={() => setSubTab("meta")}
          style={{
            padding: "0.4rem 0.9rem", border: "none",
            borderBottom: subTab === "meta" ? "3px solid #4a90e2" : "3px solid transparent",
            background: "none", cursor: "pointer", fontSize: "0.88rem",
            color: subTab === "meta" ? "#2a5cb8" : "#666", fontWeight: subTab === "meta" ? 600 : 400,
          }}
        >
          Meta Rankings
        </button>
      </nav>

      {subTab === "all" ? (
        <PokemonTable onSelectDetail={setDetailName} />
      ) : (
        <MetaRankingsView onSelectDetail={setDetailName} />
      )}
    </div>
  );
}
