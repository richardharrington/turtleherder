import {
  formatShortDate,
  type GameWithAttendance,
  type Me,
  type Team,
} from "@turtleherder/shared";
import { playerRowId } from "../GameCard.js";
import styles from "./StatusStrip.module.css";

// The personal chip: "You: Playing Wed, Jul 22 ✓". Only the status
// phrase carries semantic color; the abbreviated date adds the year only
// outside the current calendar year (formatShortDate). Full-width on
// mobile, content-width on desktop (CSS). It reads straight from the
// games cache, so optimistic attendance updates it instantly.
export function StatusStrip({ game, team, me, onOpen }: {
  game: GameWithAttendance;
  team: Team;
  me: Me;
  onOpen: (key: string) => void;
}) {
  const player = game.players.find((candidate) => candidate.playerId === me.playerId);
  if (!player) return null;
  const date = formatShortDate(game.startsAt, team.timezone);
  const status = player.status ?? "none";
  const [phrase, rest] =
    status === "yes"
      ? ["Playing", `${date} ✓`]
      : status === "no"
        ? ["Not playing", `${date} →`]
        : status === "not_sure"
          ? ["Not sure", `for ${date} →`]
          : ["No response", `for ${date} →`];

  return (
    <button
      className={styles.strip}
      data-testid="status-strip"
      onClick={() => {
        onOpen(`${game.id}:${me.playerId}`);
        window.setTimeout(() => document.getElementById(playerRowId(game.id, me.playerId))?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      }}
    >
      <span className={styles.you}>You:</span>{" "}
      <strong className={styles[`status_${status}`]}>{phrase}</strong> {rest}
    </button>
  );
}
