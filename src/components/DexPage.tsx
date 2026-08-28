import PokemonTable from "./PokemonTable";

export default function DexPage() {
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem", textAlign: "left" }}>
      <h2>Pokedex</h2>
      <p style={{ color: "#666", marginTop: "-0.5rem" }}>
        Browse and sort every Pokemon's base stats, types, and abilities.
      </p>
      <PokemonTable />
    </div>
  );
}
