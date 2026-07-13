import { useParams } from "react-router";

// Single game with inline attendance controls — the shareable link a
// captain texts the team. Placeholder until the game endpoint exists.
export function GamePage() {
  const { gameId } = useParams<"gameId">();

  return <p>Game {gameId} goes here.</p>;
}
