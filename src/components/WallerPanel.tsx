import type { SavedTeam } from "../teamStorage";
import MatchupMatrix, { POOL_SIZE } from "./MatchupMatrix";
import "./BreakerPanel.css";

/** "Which of my Pokemon walls the meta?" - ranked by how little damage each
 *  one takes from the top-usage Pokemon's most-used move. Lower is better.
 *  Click a row for the full per-target breakdown. */
export default function WallerPanel({ team }: { team: SavedTeam }) {
  return (
    <div className="breaker-panel">
      <p className="subtitle">
        How much damage each of your Pokemon takes from the <strong>top {POOL_SIZE} most-used Pokemon</strong>,
        each attacking with its real most-used damaging move, ability and item. Lower is better - it means that
        Pokemon can switch in safely. Click a Pokemon to see every individual matchup.
      </p>
      <MatchupMatrix team={team} mode="waller" />
    </div>
  );
}
