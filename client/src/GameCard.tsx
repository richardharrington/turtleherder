import {
  rosterReport,
  type AttendanceStatus,
  type GameWithAttendance,
  type PlayerGameStatus,
  type Team,
} from "@turtleherder/shared";
import { useAttendanceMutation } from "./attendance.js";
import { SegmentedControl } from "./components/SegmentedControl.js";
import { formatGameDate, formatGameTime } from "./format.js";
import styles from "./GameCard.module.css";

// One game as a card: header, a row per player with the segmented
// attendance control, then the roster report. Same content as the
// original's printgame(), redesigned for thumbs.

// Renders the report's **emphasis** markers as <strong>, as the original did.
function Bold({ text }: { text: string }) {
  return (
    <>
      {text
        .split("**")
        .map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))}
    </>
  );
}

const STATUS_PHRASES: Record<AttendanceStatus | "none", [string, string]> = {
  yes: ["will be playing", styles.statusYes!],
  no: ["will not be playing", styles.statusNo!],
  not_sure: ["isn't sure", styles.statusMaybe!],
  none: ["hasn't responded yet", styles.statusNone!],
};

function PlayerRow({
  player,
  game,
  team,
}: {
  player: PlayerGameStatus;
  game: GameWithAttendance;
  team: Team;
}) {
  const mutation = useAttendanceMutation(team.slug, game.id, player.playerId);
  const [phrase, phraseClass] = STATUS_PHRASES[player.status ?? "none"];

  return (
    <li className={styles.playerRow} data-testid="player-row">
      <p className={styles.playerLine}>
        <span className={styles.playerName}>{player.name}</span>{" "}
        <span className={phraseClass}>{phrase}</span>.
        {mutation.isError && <span className="error"> Error saving.</span>}
      </p>
      <SegmentedControl
        name={`attendance-${game.id}-${player.playerId}`}
        value={player.status}
        disabled={mutation.isPending}
        onChange={(status) => mutation.mutate(status)}
      />
    </li>
  );
}

export function GameCard({
  game,
  team,
}: {
  game: GameWithAttendance;
  team: Team;
}) {
  const date = formatGameDate(game.startsAt, team.timezone);

  if (game.opponentName === null) {
    return (
      <section className={styles.card}>
        <h3 className={styles.when}>{date}</h3>
        <p className={styles.bye}>Bye week.</p>
      </section>
    );
  }

  const time = formatGameTime(game.startsAt, team.timezone);
  const attending = game.players.filter((p) => p.status === "yes");
  const report = rosterReport({
    attendingTotal: attending.length,
    attendingQuota: attending.filter((p) => p.countsTowardMinimum).length,
    minPlayers: team.minPlayers,
    minQuotaPlayers: team.minQuotaPlayers,
    quotaNounSingular: team.quotaNounSingular,
    quotaNounPlural: team.quotaNounPlural,
  });

  return (
    <section className={styles.card}>
      <h3 className={styles.when}>{date}</h3>
      <p className={styles.versus}>
        at {time} against {game.opponentName}
        {game.opponentColor && <> (the {game.opponentColor} team)</>}:
      </p>
      <ul className={styles.roster}>
        {game.players.map((player) => (
          <PlayerRow
            key={player.playerId}
            player={player}
            game={game}
            team={team}
          />
        ))}
      </ul>
      <div className={styles.report}>
        {report.map((sentence) => (
          <p key={sentence}>
            <Bold text={sentence} />
          </p>
        ))}
      </div>
    </section>
  );
}
