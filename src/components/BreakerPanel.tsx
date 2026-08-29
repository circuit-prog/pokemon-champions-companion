import type { SavedTeam } from "../teamStorage";
import MatchupMatrix, { POOL_SIZE } from "./MatchupMatrix";
import "./BreakerPanel.css";

/** "Which of my Pokemon breaks through the meta?" - ranked by how hard each
 *  one hits the top-usage Pokemon. Click a row to see all {POOL_SIZE}
 *  individual matchups rather than just the average. */
export default function BreakerPanel({ team }: { team: SavedTeam }) {
  return (
    <div className="breaker-panel">
      <p className="subtitle">
        How hard each of your Pokemon hits the <strong>top {POOL_SIZE} most-used Pokemon</strong>, using its best
        selected move against each one. Each target runs its real most-used ability and item; EVs are neutral,
        because Pikalytics doesn't publish EV spreads. Click a Pokemon to see every individual matchup.
      </p>
      <MatchupMatrix team={team} mode="breaker" />
    </div>
  );
}
