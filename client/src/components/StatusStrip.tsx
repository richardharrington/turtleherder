import type { GameWithAttendance, Me, Team } from "@turtleherder/shared";
import { playerRowId } from "../GameCard.js";
import styles from "./StatusStrip.module.css";

function day(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(new Date(iso));
}

export function StatusStrip({ game, team, me, onOpen }: {
  game: GameWithAttendance;
  team: Team;
  me: Me;
  onOpen: (key: string) => void;
}) {
  const player = game.players.find((candidate) => candidate.playerId === me.playerId);
  if (!player) return null;
  const label = day(game.startsAt, team.timezone);
  const status = player.status === "yes" ? `playing ${label} ✓`
    : player.status === "no" ? `not playing ${label} →`
      : player.status === "not_sure" ? `not sure for ${label} →`
        : `no response yet for ${label} →`;

  return (
    <button
      className={styles.strip}
      data-testid="status-strip"
      onClick={() => {
        onOpen(`${game.id}:${me.playerId}`);
        window.setTimeout(() => document.getElementById(playerRowId(game.id, me.playerId))?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      }}
    >
      <strong>You:</strong> {status}
    </button>
  );
}
